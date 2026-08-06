/**
 * mergeServerDirector.ts
 *
 * Bridges the dual-pacing gap between the server world engine director state
 * and the client StoryDirector. The server computes authoritative pacing signals
 * (phase, tension, fatigue, etc.) during background world ticks; the client
 * maintains its own local beat/tension system. This module reconciles the two
 * perspectives so the client can correct drift without losing its local context.
 *
 * Usage (client-side, after receiving a turn response):
 *   import { mergeServerDirectorState } from "@/lib/storyDirector/mergeServerDirector";
 *   const updatedDirector = mergeServerDirectorState(localDirector, serverDirectorState);
 */

import type { StoryDirectorState } from "./types";

/** Shape of the `server_director_state` field injected into the turn SSE payload. */
export type ServerDirectorSnapshot = {
  directorIntent: string | null;
  currentPhase: string;
  pacingSummary: {
    tension: number;
    mystery: number;
    fatigue: number;
    progress: number;
    agency_health: number;
    reveal_pressure: number;
  };
  turnIndex: number;
};

/** Output of the merge: updated director state plus diagnostics. */
export type MergedDirectorResult = {
  /** Reconciled StoryDirectorState ready to persist into the client store. */
  director: StoryDirectorState;

  /**
   * Diagnostic guidance signals for client-side UI / debug.
   * These are NOT persisted; they describe what changed and why.
   */
  diagnostics: {
    /** Did the server signal significantly disagree with the client? */
    hadDrift: boolean;
    /** Human-readable summary of what was adjusted. */
    summary: string;
    /** How much the local tension was adjusted by (signed). */
    tensionDelta: number;
    /** Server phase mapped to a suggested client beat mode. */
    serverBeatModeHint: string | null;
    /** Server fatigue level (0-1). */
    serverFatigue: number;
    /** Server mystery level (0-1). */
    serverMystery: number;
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number): number {
  const safe = Number.isFinite(n) ? Math.trunc(n) : min;
  return Math.max(min, Math.min(max, safe));
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/**
 * Map server DirectorPhase → client BeatMode hint.
 * This is a soft suggestion; the client planner remains the authority.
 */
function mapServerPhaseToBeatMode(phase: string): string | null {
  switch (phase) {
    case "quiet":
      return "quiet";
    case "build_up":
      return "pressure";
    case "pressure":
      return "pressure";
    case "release":
      return "quiet";
    case "reveal":
      return "reveal";
    case "recovery":
      return "aftershock";
    default:
      return null;
  }
}

// ─── Core merge logic ───────────────────────────────────────────────────────

/**
 * Reconcile the client-side StoryDirectorState with the server's pacing signal.
 *
 * Rules (ordered by priority):
 * 1. Server fatigue >= 0.75 → clamp local tension, suggest recovery.
 * 2. Server pacing tension is mapped to 0-100 and blended with local tension:
 *    weight = 0.3 (server) / 0.7 (local). Local is primary because it has
 *    per-turn granularity; server is a lagging indicator from background ticks.
 * 3. If |serverTension100 - localTension| >= 25, treat as drift and nudge
 *    harder (weight 0.5).
 * 4. Server progress/agency_health inform stallCount corrections.
 * 5. Server phase is recorded as diagnostic only; the client planner is the
 *    final beat-mode authority.
 */
export function mergeServerDirectorState(
  local: StoryDirectorState,
  server: ServerDirectorSnapshot | null | undefined
): MergedDirectorResult {
  const diagnostics: MergedDirectorResult["diagnostics"] = {
    hadDrift: false,
    summary: "",
    tensionDelta: 0,
    serverBeatModeHint: null,
    serverFatigue: 0,
    serverMystery: 0,
  };

  if (!server) {
    diagnostics.summary = "no server director state available; keeping local state unchanged";
    return { director: local, diagnostics };
  }

  const pacing = server.pacingSummary;
  const serverTension01 = clamp01(pacing.tension);
  const serverTension100 = clampInt(Math.round(serverTension01 * 100), 0, 100);
  const serverFatigue = clamp01(pacing.fatigue);
  const serverProgress = clamp01(pacing.progress);
  const serverAgency = clamp01(pacing.agency_health);
  const serverMystery = clamp01(pacing.mystery);

  diagnostics.serverFatigue = serverFatigue;
  diagnostics.serverMystery = serverMystery;

  const localTension = clampInt(local.tension ?? 18, 0, 100);

  // Compute gaps
  const tensionGap = Math.abs(serverTension100 - localTension);
  if (tensionGap >= 25) {
    diagnostics.hadDrift = true;
  }

  // ── Rule 1: high fatigue forces recovery ──
  if (serverFatigue >= 0.75) {
    const mergedTension = clampInt(
      Math.round(localTension * 0.6 + serverTension100 * 0.4),
      0,
      100
    );
    const delta = mergedTension - localTension;
    diagnostics.tensionDelta = delta;
    diagnostics.summary = `server fatigue high (${(serverFatigue * 100).toFixed(0)}%); tension adjusted by ${delta >= 0 ? "+" : ""}${delta}`;
    return {
      director: { ...local, tension: mergedTension },
      diagnostics,
    };
  }

  // ── Rule 2 & 3: blend tension with adaptive weight ──
  const blendWeight = diagnostics.hadDrift ? 0.5 : 0.3;
  const blendedTension = clampInt(
    Math.round(localTension * (1 - blendWeight) + serverTension100 * blendWeight),
    0,
    100
  );
  const tensionDelta = blendedTension - localTension;
  diagnostics.tensionDelta = tensionDelta;

  // ── Rule 4: server progress/agency inform stall ──
  let stallCount = clampInt(local.stallCount ?? 0, 0, 99);
  if (serverProgress >= 0.6 && stallCount >= 2) {
    stallCount = Math.max(0, stallCount - 1);
  }
  if (serverAgency <= 0.3 && stallCount < 3) {
    stallCount = Math.min(99, stallCount + 1);
  }

  // ── Rule 5: phase mapping (diagnostic only) ──
  const serverBeatModeHint = mapServerPhaseToBeatMode(server.currentPhase);
  diagnostics.serverBeatModeHint = serverBeatModeHint;

  // ── Build summary ──
  const parts: string[] = [];
  if (tensionDelta !== 0) {
    parts.push(`tension ${tensionDelta >= 0 ? "+" : ""}${tensionDelta}`);
  }
  if (stallCount !== (local.stallCount ?? 0)) {
    parts.push(`stallCount ${local.stallCount}→${stallCount}`);
  }
  if (serverBeatModeHint) {
    parts.push(`server phase="${server.currentPhase}"→hint="${serverBeatModeHint}"`);
  }
  if (diagnostics.hadDrift) {
    parts.unshift("drift detected");
  }
  diagnostics.summary = parts.length > 0 ? parts.join("; ") : "no significant drift; local state maintained";

  return {
    director: {
      ...local,
      tension: blendedTension,
      stallCount,
    },
    diagnostics,
  };
}

import { pool } from "@/db/index";
import type { DirectorPhase, DirectorPlan } from "./contracts";

export type WorldDirectorPacingState = {
  tension: number;
  mystery: number;
  fatigue: number;
  progress: number;
  agency_health: number;
  reveal_pressure: number;
};

export type WorldDirectorState = {
  sessionId: string;
  userId: string | null;
  turnIndex: number;
  phase: DirectorPhase;
  pacing: WorldDirectorPacingState;
  recentDirectorIntent: string | null;
  worldRevision: string | null;
  updatedAt?: string;
};

const DEFAULT_PACING: WorldDirectorPacingState = {
  tension: 0.3,
  mystery: 0.5,
  fatigue: 0.2,
  progress: 0.3,
  agency_health: 0.75,
  reveal_pressure: 0.25,
};

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

function normalizePacing(raw: unknown): WorldDirectorPacingState {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    tension: clamp01(o.tension, DEFAULT_PACING.tension),
    mystery: clamp01(o.mystery, DEFAULT_PACING.mystery),
    fatigue: clamp01(o.fatigue, DEFAULT_PACING.fatigue),
    progress: clamp01(o.progress, DEFAULT_PACING.progress),
    agency_health: clamp01(o.agency_health, DEFAULT_PACING.agency_health),
    reveal_pressure: clamp01(o.reveal_pressure, DEFAULT_PACING.reveal_pressure),
  };
}

function defaultDirectorState(sessionId: string, userId: string | null, turnIndex = 0): WorldDirectorState {
  return {
    sessionId,
    userId,
    turnIndex,
    phase: "quiet",
    pacing: { ...DEFAULT_PACING },
    recentDirectorIntent: null,
    worldRevision: null,
  };
}

export async function loadDirectorState(sessionId: string): Promise<WorldDirectorState | null> {
  if (!sessionId) return null;
  let client;
  try {
    client = await pool.connect();
  } catch {
    return null;
  }
  try {
    const r = await client.query<{
      session_id: string;
      user_id: string | null;
      turn_index: number;
      phase: DirectorPhase;
      pacing_json: Record<string, unknown> | null;
      recent_director_intent: string | null;
      world_revision: string | null;
      updated_at: Date;
    }>(
      `SELECT session_id, user_id, turn_index, phase, pacing_json, recent_director_intent,
              world_revision::text AS world_revision, updated_at
       FROM world_engine_director_state
       WHERE session_id = $1
       LIMIT 1`,
      [sessionId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      turnIndex: Number(row.turn_index ?? 0),
      phase: row.phase,
      pacing: normalizePacing(row.pacing_json),
      recentDirectorIntent: row.recent_director_intent,
      worldRevision: row.world_revision,
      updatedAt: row.updated_at?.toISOString?.(),
    };
  } catch {
    return null;
  } finally {
    client.release();
  }
}

export function computeNextDirectorState(args: {
  previousState: WorldDirectorState | null;
  plan: DirectorPlan;
  sessionId: string;
  userId: string | null;
  turnIndex: number;
  worldRevision?: bigint | string | null;
}): WorldDirectorState {
  const prev = args.previousState ?? defaultDirectorState(args.sessionId, args.userId, args.turnIndex);
  const pacing = {
    tension: clamp01(args.plan.pacing_assessment.tension, prev.pacing.tension),
    mystery: clamp01(args.plan.pacing_assessment.mystery, prev.pacing.mystery),
    fatigue: clamp01(args.plan.pacing_assessment.fatigue, prev.pacing.fatigue),
    progress: clamp01(args.plan.pacing_assessment.progress, prev.pacing.progress),
    agency_health: clamp01(args.plan.pacing_assessment.agency_health, prev.pacing.agency_health),
    reveal_pressure: clamp01(args.plan.pacing_assessment.reveal_pressure, prev.pacing.reveal_pressure),
  };
  let phase = args.plan.target_phase;
  if (pacing.fatigue >= 0.75 || (pacing.tension >= 0.85 && pacing.agency_health < 0.45)) {
    phase = "recovery";
  } else if (pacing.reveal_pressure >= 0.8 && args.plan.reveal_policy !== "hold") {
    phase = args.plan.reveal_policy === "hint_only" ? "build_up" : "reveal";
  } else if (pacing.tension >= 0.7) {
    phase = "pressure";
  } else if (pacing.progress <= 0.2 && pacing.tension <= 0.35) {
    phase = "build_up";
  }

  return {
    sessionId: args.sessionId,
    userId: args.userId,
    turnIndex: Math.max(0, Math.trunc(args.turnIndex ?? prev.turnIndex)),
    phase,
    pacing,
    recentDirectorIntent: args.plan.director_intent.slice(0, 500),
    worldRevision: args.worldRevision == null ? prev.worldRevision : String(args.worldRevision),
  };
}

export async function saveDirectorState(state: WorldDirectorState): Promise<void> {
  if (!state.sessionId) return;
  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    await client.query(
      `INSERT INTO world_engine_director_state (
         session_id, user_id, turn_index, phase, pacing_json,
         recent_director_intent, world_revision, updated_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
       ON CONFLICT (session_id) DO UPDATE SET
         user_id = COALESCE(EXCLUDED.user_id, world_engine_director_state.user_id),
         turn_index = GREATEST(world_engine_director_state.turn_index, EXCLUDED.turn_index),
         phase = EXCLUDED.phase,
         pacing_json = EXCLUDED.pacing_json,
         recent_director_intent = EXCLUDED.recent_director_intent,
         world_revision = COALESCE(EXCLUDED.world_revision, world_engine_director_state.world_revision),
         updated_at = NOW()`,
      [
        state.sessionId,
        state.userId,
        state.turnIndex,
        state.phase,
        JSON.stringify(state.pacing),
        state.recentDirectorIntent,
        state.worldRevision,
      ]
    );
  } catch {
    /* director state is best-effort */
  } finally {
    client.release();
  }
}

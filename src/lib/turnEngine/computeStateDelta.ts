// src/lib/turnEngine/computeStateDelta.ts
/**
 * Phase-2: compute the minimal `StateDelta` for a turn.
 *
 * The delta is the structured summary of "what changed this turn". Two
 * callsites matter:
 *
 * - PRE-narrative:  Built from `NormalizedPlayerIntent` + control preflight +
 *   rule snapshot. Only fills *expected* / *forced* fields (e.g. preflight
 *   block => `isActionLegal = false`). Most fields are unknown at this point.
 *
 * - POST-narrative: Enriched with the parsed DM record so analytics and
 *   downstream commit paths can reason about state in a structured way.
 *
 * NOTE (transitional): the authoritative source of truth for the online turn
 * is still `resolveDmTurn()` + `applyDmChangeSetToDmRecord()`. The delta here
 * is an *observer* / *guard input* and does NOT yet replace those. See
 * `docs/options-regen-observability-and-rollout.md` for the multi-phase plan.
 */
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import type {
  NormalizedPlayerIntent,
  StateDelta,
  StateDeltaLegalityReason,
} from "@/lib/turnEngine/types";

export function emptyStateDelta(): StateDelta {
  return {
    isActionLegal: null,
    illegalReasons: [],
    consumesTime: false,
    sanityDamage: 0,
    isDeath: false,
    npcLocationUpdates: [],
    npcAttitudeUpdates: [],
    taskUpdates: [],
    newTasks: [],
    mustDegrade: false,
  };
}

export type ComputePreDeltaArgs = {
  intent: NormalizedPlayerIntent;
  control: PlayerControlPlane | null;
  rule: PlayerRuleSnapshot;
  /** Whether input moderation already decided "fallback" (safe rewrite). */
  inputFellBack: boolean;
  /** Whether anti-cheat rewrote the latest user input. */
  antiCheatFallback: boolean;
};

/**
 * Pre-narrative delta: fills only the fields we can confidently derive before
 * the main model speaks.
 */
export function computePreNarrativeDelta(args: ComputePreDeltaArgs): StateDelta {
  const delta = emptyStateDelta();
  const reasons: StateDeltaLegalityReason[] = [];

  if (args.control?.block_dm === true) {
    delta.isActionLegal = false;
    reasons.push("preflight_block_dm");
    delta.mustDegrade = true;
  }

  if (args.antiCheatFallback) {
    reasons.push("anti_cheat_fallback");
  }

  if (args.intent.isSystemTransition) {
    delta.consumesTime = false;
    delta.timeCost = "free";
  } else {
    // Default assumption: typical story actions consume time.
    delta.consumesTime = true;
    delta.timeCost = "standard";
  }

  // Combat hint: if pipelineRule signaled in_combat_hint, assume risk is non-zero.
  if (args.rule.in_combat_hint && args.intent.kind === "combat") {
    delta.consumesTime = true;
    delta.timeCost = "heavy";
  }

  if (reasons.length > 0) {
    delta.illegalReasons = reasons;
  }
  return delta;
}

export type ComputePostDeltaArgs = {
  pre: StateDelta;
  dmRecord: Record<string, unknown> | null;
};

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pickFiniteInt(v: unknown, fallback: number): number {
  const n =
    typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : Number(String(v ?? ""));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function pickTimeCost(v: unknown): StateDelta["timeCost"] {
  if (v === "free" || v === "light" || v === "standard" || v === "heavy" || v === "dangerous") {
    return v;
  }
  return undefined;
}

/**
 * Post-narrative delta: enriches the pre-delta with the structured fields
 * the DM record produced.
 */
export function computePostNarrativeDelta(args: ComputePostDeltaArgs): StateDelta {
  const delta: StateDelta = { ...args.pre };
  const dm = args.dmRecord;
  if (!dm) return delta;

  const isActionLegal = pickBool(dm.is_action_legal, true);
  if (delta.isActionLegal === null) {
    delta.isActionLegal = isActionLegal;
  } else if (delta.isActionLegal && !isActionLegal) {
    delta.isActionLegal = false;
  }

  delta.sanityDamage = pickFiniteInt(dm.sanity_damage, delta.sanityDamage);
  delta.isDeath = pickBool(dm.is_death, delta.isDeath);
  delta.consumesTime = pickBool(dm.consumes_time, delta.consumesTime);
  const tc = pickTimeCost(dm.time_cost);
  if (tc) delta.timeCost = tc;

  const currencyDelta = pickFiniteInt(dm.currency_change, 0);
  if (currencyDelta !== 0) delta.originiumDelta = currencyDelta;

  const loc = pickString(dm.player_location);
  if (loc) delta.playerLocation = loc;

  if (Array.isArray(dm.npc_location_updates)) {
    const rows: StateDelta["npcLocationUpdates"] = [];
    for (const r of dm.npc_location_updates) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      const row = r as Record<string, unknown>;
      const npcId = pickString(row.npc_id ?? row.npcId);
      const location = pickString(row.location ?? row.to);
      if (npcId && location) rows.push({ npcId, location });
    }
    delta.npcLocationUpdates = rows;
  }

  if (Array.isArray(dm.relationship_updates)) {
    const rows: StateDelta["npcAttitudeUpdates"] = [];
    for (const r of dm.relationship_updates) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      const row = r as Record<string, unknown>;
      const npcId = pickString(row.npc_id ?? row.npcId);
      const attitude = pickString(row.attitude ?? row.to);
      const deltaN = pickFiniteInt(row.delta, 0);
      if (npcId && attitude) {
        rows.push({
          npcId,
          attitude,
          ...(deltaN !== 0 ? { delta: deltaN } : {}),
        });
      }
    }
    delta.npcAttitudeUpdates = rows;
  }

  if (Array.isArray(dm.task_updates)) {
    const rows: StateDelta["taskUpdates"] = [];
    for (const r of dm.task_updates) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      const row = r as Record<string, unknown>;
      const taskId = pickString(row.task_id ?? row.id);
      if (!taskId) continue;
      const status = pickString(row.status);
      const note = pickString(row.note ?? row.summary);
      rows.push({
        taskId,
        ...(status ? { status } : {}),
        ...(note ? { note } : {}),
      });
    }
    delta.taskUpdates = rows;
  }

  if (Array.isArray(dm.new_tasks)) {
    const rows: StateDelta["newTasks"] = [];
    for (const r of dm.new_tasks) {
      if (!r || typeof r !== "object" || Array.isArray(r)) continue;
      const row = r as Record<string, unknown>;
      const taskId = pickString(row.task_id ?? row.id);
      const title = pickString(row.title ?? row.name);
      if (taskId && title) rows.push({ taskId, title });
    }
    delta.newTasks = rows;
  }

  // Settlement guard / protocol guard already flagged mustDegrade upstream.
  const meta = dm.security_meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const action = (meta as Record<string, unknown>).action;
    if (action === "degrade" || action === "block") {
      delta.mustDegrade = true;
    }
  }

  return delta;
}

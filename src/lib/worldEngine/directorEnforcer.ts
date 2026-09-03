import type { DirectorPhase, ChapterPacingPlan, DirectorAgendaItem, DirectorNpcAction } from "./contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Game state snapshot passed to the enforcer. Only the fields the enforcer
 * actually needs are required — callers should provide what they have.
 */
export type DirectorEnforcerGameState = {
  /** NPC IDs known to be alive, present, and active in the current scene. */
  activeNpcIds: ReadonlySet<string> | readonly string[];
  /** NPC IDs known to be dead, departed, or otherwise inactive.
   *  When absent the enforcer falls back to checking only against activeNpcIds. */
  deadOrInactiveNpcIds?: ReadonlySet<string> | readonly string[];
  /** The phase the game is currently in (used to validate target_phase transitions). */
  currentPhase?: DirectorPhase;
};

/** A single rejected item with the reason it was filtered out. */
export type EnforcerRejection = {
  itemCode: string;
  reason: string;
  kind: "agenda_item" | "npc_action" | "phase_transition";
};

export type EnforcedChapterPacingPlan = {
  /** The plan with invalid items removed (shallow copy with filtered arrays). */
  plan: ChapterPacingPlan;
  /** Every item that was rejected, with a short diagnostic reason. */
  rejections: EnforcerRejection[];
  /** Pacing inconsistencies detected (warnings, not rejections — they don't
   *  remove items but should be surfaced to operators). */
  pacingWarnings: string[];
  /** True when the plan passed every hard check (phase, NPC references).
   *  Pacing warnings alone do not cause this to be false. */
  passedAll: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Allowed phase transitions. The key is the current phase; the value is the
 * set of phases the director is allowed to target from that state.
 *
 * Rules:
 *  - quiet   → quiet, build_up, pressure (ramping up)
 *  - build_up → build_up, pressure, release, quiet (ramp or defuse)
 *  - pressure → pressure, release, reveal, recovery (peak or break)
 *  - release  → release, quiet, recovery, build_up (cooldown or re-ramp)
 *  - reveal   → reveal, release, recovery (pivot away from peak)
 *  - recovery → recovery, quiet, build_up (restart the cycle)
 */
const VALID_PHASE_TRANSITIONS: Record<DirectorPhase, ReadonlySet<DirectorPhase>> = {
  quiet: new Set(["quiet", "build_up", "pressure"]),
  build_up: new Set(["build_up", "pressure", "release", "quiet"]),
  pressure: new Set(["pressure", "release", "reveal", "recovery"]),
  release: new Set(["release", "quiet", "recovery", "build_up"]),
  reveal: new Set(["reveal", "release", "recovery"]),
  recovery: new Set(["recovery", "quiet", "build_up"]),
};

/**
 * Pacing consistency thresholds. When two metrics cross these boundaries in
 * opposite directions without the director_intent acknowledging the tension,
 * a warning is emitted.
 */
const PACING_TENSION_HIGH = 0.8;
const PACING_FATIGUE_LOW = 0.2;
const PACING_FATIGUE_HIGH = 0.7;
const PACING_TENSION_LOW = 0.2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSet(ids: readonly string[] | ReadonlySet<string>): Set<string> {
  if (ids instanceof Set) return ids;
  return new Set(ids);
}

export function npcReferencedIn(text: string, npcIds: Set<string>): string | null {
  if (!text) return null;
  for (const id of npcIds) {
    if (text.includes(id)) return id;
  }
  return null;
}

function payloadMentionsNpc(
  payload: Record<string, unknown>,
  npcIds: Set<string>
): string | null {
  for (const value of Object.values(payload)) {
    if (typeof value !== "string") continue;
    const hit = npcReferencedIn(value, npcIds);
    if (hit) return hit;
  }
  return null;
}

/**
 * Returns the first dead/inactive NPC ID found in the agenda item's text
 * fields, or null if the item looks clean.
 */
function findDeadNpcInAgendaItem(
  item: DirectorAgendaItem,
  deadIds: Set<string>
): string | null {
  const hit =
    npcReferencedIn(item.title, deadIds) ??
    npcReferencedIn(item.injection_hint, deadIds) ??
    payloadMentionsNpc(item.payload, deadIds);
  return hit;
}

/**
 * Lightweight check for persisted agenda items: returns the first dead NPC ID
 * found in the item's text fields, or null. Callers pass the flat string fields
 * directly to avoid a dependency on the PersistedDirectorAgendaItem type.
 */
export function findDeadNpcInPersistedAgendaItem(
  fields: { title: string; injectionHint: string; payload: Record<string, unknown> },
  deadIds: Set<string>
): string | null {
  return (
    npcReferencedIn(fields.title, deadIds) ??
    npcReferencedIn(fields.injectionHint, deadIds) ??
    payloadMentionsNpc(fields.payload, deadIds)
  );
}

// ---------------------------------------------------------------------------
// Check 1: Agenda items must not reference dead / inactive NPCs
// ---------------------------------------------------------------------------

function enforceAgendaNpcReferences(
  items: DirectorAgendaItem[],
  deadIds: Set<string>
): { kept: DirectorAgendaItem[]; rejections: EnforcerRejection[] } {
  if (deadIds.size === 0) return { kept: items, rejections: [] };
  const kept: DirectorAgendaItem[] = [];
  const rejections: EnforcerRejection[] = [];
  for (const item of items) {
    const hit = findDeadNpcInAgendaItem(item, deadIds);
    if (hit) {
      rejections.push({
        itemCode: item.event_code,
        reason: `references dead/inactive NPC "${hit}"`,
        kind: "agenda_item",
      });
    } else {
      kept.push(item);
    }
  }
  return { kept, rejections };
}

// ---------------------------------------------------------------------------
// Check 2: target_phase transitions must be valid
// ---------------------------------------------------------------------------

function validatePhaseTransition(
  currentPhase: DirectorPhase,
  targetPhase: DirectorPhase
): EnforcerRejection | null {
  const allowed = VALID_PHASE_TRANSITIONS[currentPhase];
  if (!allowed.has(targetPhase)) {
    return {
      itemCode: targetPhase,
      reason: `invalid phase transition: ${currentPhase} → ${targetPhase} (allowed: ${[...allowed].join(", ")})`,
      kind: "phase_transition",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Check 3: Pacing assessment internal consistency
// ---------------------------------------------------------------------------

function checkPacingConsistency(
  plan: ChapterPacingPlan
): string[] {
  const warnings: string[] = [];
  const { tension, mystery, fatigue } = plan.pacing_assessment;

  // High tension + low fatigue is suspicious — exhausted players shouldn't
  // feel high tension, and high-tension scenes wear players out.
  if (tension >= PACING_TENSION_HIGH && fatigue <= PACING_FATIGUE_LOW) {
    const explained =
      plan.director_intent.toLowerCase().includes("疲劳") ||
      plan.director_intent.toLowerCase().includes("fatigue") ||
      plan.director_intent.toLowerCase().includes("紧张") ||
      plan.director_intent.toLowerCase().includes("tension");
    if (!explained) {
      warnings.push(
        `pacing inconsistency: tension=${tension.toFixed(2)} with fatigue=${fatigue.toFixed(2)} — ` +
        `high tension usually implies elevated fatigue; director_intent does not acknowledge this`
      );
    }
  }

  // High fatigue + high tension: players are worn out but still under pressure.
  // This is a burnout risk signal.
  if (fatigue >= PACING_FATIGUE_HIGH && tension >= PACING_TENSION_HIGH) {
    warnings.push(
      `pacing burnout risk: fatigue=${fatigue.toFixed(2)} + tension=${tension.toFixed(2)} — ` +
      `player may be overwhelmed; consider targeting "release" or "recovery"`
    );
  }

  // High mystery with very low tension: unintuitive but not necessarily wrong.
  // Only flag when mystery is maxed out and nothing else moves.
  if (mystery >= 0.9 && tension <= PACING_TENSION_LOW && fatigue <= PACING_FATIGUE_LOW) {
    warnings.push(
      `pacing oddity: mystery=${mystery.toFixed(2)} with tension=${tension.toFixed(2)} — ` +
      `deep mystery in a low-tension context may indicate stalled pacing`
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Check 4: npc_next_actions must only reference present NPCs
// ---------------------------------------------------------------------------

function enforceNpcActionReferences(
  actions: DirectorNpcAction[],
  activeIds: Set<string>
): { kept: DirectorNpcAction[]; rejections: EnforcerRejection[] } {
  if (activeIds.size === 0) {
    // No NPC data available — pass everything through rather than blindly
    // rejecting. This is the "fail-open" posture required by the agent rules.
    return { kept: actions, rejections: [] };
  }
  const kept: DirectorNpcAction[] = [];
  const rejections: EnforcerRejection[] = [];
  for (const action of actions) {
    if (activeIds.has(action.npc_code)) {
      kept.push(action);
    } else {
      rejections.push({
        itemCode: action.npc_code,
        reason: `npc_next_action references NPC "${action.npc_code}" which is not in the active NPC set`,
        kind: "npc_action",
      });
    }
  }
  return { kept, rejections };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Validate a ChapterPacingPlan against actual game state before it is written to
 * the agenda queue or injected into the DM prompt.
 *
 * Checks performed:
 * 1. world_events_to_schedule items must not reference dead/inactive NPCs.
 * 2. target_phase must be a valid transition from currentPhase.
 * 3. pacing_assessment values must be internally consistent (warnings only).
 * 4. npc_next_actions must only reference NPCs present in activeNpcIds.
 *
 * The returned plan is a shallow copy with filtered arrays. Rejections and
 * pacing warnings are reported alongside it so callers can log or surface them.
 */
export function enforceChapterPacingPlan(
  plan: ChapterPacingPlan,
  gameState: DirectorEnforcerGameState
): EnforcedChapterPacingPlan {
  const activeIds = toSet(gameState.activeNpcIds);
  const deadIds = gameState.deadOrInactiveNpcIds
    ? toSet(gameState.deadOrInactiveNpcIds)
    : new Set<string>();

  const allRejections: EnforcerRejection[] = [];

  // --- Check 1: Agenda items must not reference dead NPCs ---
  const agendaResult = enforceAgendaNpcReferences(
    plan.world_events_to_schedule,
    deadIds
  );
  allRejections.push(...agendaResult.rejections);

  // --- Check 2: Phase transitions ---
  let effectiveTargetPhase = plan.target_phase;
  if (gameState.currentPhase) {
    const phaseIssue = validatePhaseTransition(gameState.currentPhase, plan.target_phase);
    if (phaseIssue) {
      allRejections.push(phaseIssue);
      // Downgrade the target_phase to a safe fallback rather than leaving an
      // invalid value in the plan.
      effectiveTargetPhase = gameState.currentPhase;
    }
  }

  // --- Check 3: Pacing consistency (warnings only) ---
  const pacingWarnings = checkPacingConsistency(plan);

  // --- Check 4: npc_next_actions must reference present NPCs ---
  const npcResult = enforceNpcActionReferences(plan.npc_next_actions, activeIds);
  allRejections.push(...npcResult.rejections);

  // --- Build the filtered plan ---
  const filteredPlan: ChapterPacingPlan = {
    ...plan,
    target_phase: effectiveTargetPhase,
    world_events_to_schedule: agendaResult.kept,
    npc_next_actions: npcResult.kept,
  };

  const passedAll = allRejections.length === 0;

  if (!passedAll) {
    console.debug("[worldEngine] directorEnforcer rejected items", {
      rejectionCount: allRejections.length,
      pacingWarningCount: pacingWarnings.length,
      rejections: allRejections.map((r) => ({
        kind: r.kind,
        itemCode: r.itemCode,
        reason: r.reason,
      })),
      pacingWarnings,
    });
  }

  return { plan: filteredPlan, rejections: allRejections, pacingWarnings, passedAll };
}

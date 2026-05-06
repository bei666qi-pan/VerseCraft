import { z } from "zod";

export type WorldEngineTrigger =
  | "in_game_day_elapsed"
  | "multi_room_movement"
  | "key_story_node_hit"
  | "important_npc_state_changed"
  | "world_fact_threshold_reached"
  | "plot_stagnation_detected"
  | "repeated_investigation_loop"
  | "due_hook_reached"
  | "npc_agenda_due"
  | "clue_threshold_reached"
  | "tension_too_low"
  | "tension_too_high";

export type DirectorPhase =
  | "quiet"
  | "build_up"
  | "pressure"
  | "release"
  | "reveal"
  | "recovery";

export type DirectorRiskLevel = "low" | "medium" | "high";
export type RevealPolicy = "hold" | "hint_only" | "soft_reveal" | "redirect";
export type DirectorPriority = "low" | "medium" | "high";

export type DirectorPacingAssessment = {
  tension: number;
  mystery: number;
  fatigue: number;
  progress: number;
  agency_health: number;
  reveal_pressure: number;
};

export type DirectorRiskAssessment = {
  agency_risk: DirectorRiskLevel;
  continuity_risk: DirectorRiskLevel;
  spoiler_risk: DirectorRiskLevel;
  safety_risk: DirectorRiskLevel;
};

export type DirectorNpcAction = {
  npc_code: string;
  action: string;
  urgency: DirectorPriority;
  eta_turns: number;
  knowledge_scope?: string[];
  must_not_reveal?: string[];
};

export type DirectorAgendaItem = {
  event_code: string;
  title: string;
  due_in_turns: number;
  ttl_turns: number;
  priority: DirectorPriority;
  salience: number;
  trigger_conditions: string[];
  injection_hint: string;
  agency_constraints: string[];
  forbidden_outcomes: string[];
  payload: Record<string, unknown>;
};

export type DirectorBranchSeed = {
  seed_code: string;
  summary: string;
  confidence: number;
  reveal_policy?: RevealPolicy;
};

export type DirectorConsistencyWarning = {
  code: string;
  message: string;
  severity: DirectorPriority;
};

export type DirectorPrivateHook = {
  hook_code: string;
  summary: string;
  ttl_turns: number;
  must_not_surface_directly: true;
};

export type DirectorPlan = {
  schema_version: "director_plan_v1";
  director_intent: string;
  current_phase: DirectorPhase;
  target_phase: DirectorPhase;
  pacing_assessment: DirectorPacingAssessment;
  risk_assessment: DirectorRiskAssessment;
  reveal_policy: RevealPolicy;
  npc_next_actions: DirectorNpcAction[];
  world_events_to_schedule: DirectorAgendaItem[];
  story_branch_seeds: DirectorBranchSeed[];
  consistency_warnings: DirectorConsistencyWarning[];
  player_private_hooks: DirectorPrivateHook[];
};

export type WorldEngineTickPayload = {
  requestId: string;
  userId: string | null;
  sessionId: string;
  latestUserInput: string;
  triggerSignals: WorldEngineTrigger[];
  controlRiskTags: string[];
  dmNarrativePreview: string;
  playerLocation: string | null;
  previousPlayerLocation?: string | null;
  npcLocationUpdateCount: number;
  turnIndex: number;
  dedupKey: string;
  enqueuedAt: string;
};

export type WorldEngineStructuredDelta = DirectorPlan & {
  /** True when the deterministic validator allows event rows to be persisted. */
  agenda_write_allowed: boolean;
  agenda_reject_reasons: string[];
};

const PRIORITIES = ["low", "medium", "high"] as const;
const PHASES = ["quiet", "build_up", "pressure", "release", "reveal", "recovery"] as const;
const RISK_LEVELS = ["low", "medium", "high"] as const;
const REVEAL_POLICIES = ["hold", "hint_only", "soft_reveal", "redirect"] as const;

function clamp01(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  const safe = Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.max(min, Math.min(max, safe));
}

function clampText(v: unknown, max: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max);
}

function uniqueStrings(v: unknown, cap: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = clampText(x, maxLen);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function sanitizeCode(v: unknown, fallbackPrefix: string): string {
  const raw = clampText(v, 80).toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9_-]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || `${fallbackPrefix}_UNKNOWN`;
}

function enumOr<T extends string>(v: unknown, values: readonly T[], fallback: T): T {
  return values.includes(v as T) ? (v as T) : fallback;
}

const directorPlanSchema = z
  .object({
    schema_version: z.literal("director_plan_v1").optional(),
    director_intent: z.string().optional(),
    current_phase: z.enum(PHASES).optional(),
    target_phase: z.enum(PHASES).optional(),
    pacing_assessment: z.record(z.string(), z.unknown()).optional(),
    risk_assessment: z.record(z.string(), z.unknown()).optional(),
    reveal_policy: z.enum(REVEAL_POLICIES).optional(),
    npc_next_actions: z.array(z.unknown()).optional(),
    world_events_to_schedule: z.array(z.unknown()).optional(),
    story_branch_seeds: z.array(z.unknown()).optional(),
    consistency_warnings: z.array(z.unknown()).optional(),
    player_private_hooks: z.array(z.unknown()).optional(),
  })
  .passthrough();

function normalizeNpcActions(raw: unknown): DirectorNpcAction[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectorNpcAction[] = [];
  for (const x of raw) {
    const o = asRecord(x);
    if (!o) continue;
    const npcCode = sanitizeCode(o.npc_code, "NPC");
    const action = clampText(o.action, 220);
    if (!npcCode || !action) continue;
    out.push({
      npc_code: npcCode,
      action,
      urgency: enumOr(o.urgency, PRIORITIES, "low"),
      eta_turns: clampInt(o.eta_turns, 0, 24, 1),
      ...(uniqueStrings(o.knowledge_scope, 8, 80).length > 0
        ? { knowledge_scope: uniqueStrings(o.knowledge_scope, 8, 80) }
        : {}),
      ...(uniqueStrings(o.must_not_reveal, 8, 120).length > 0
        ? { must_not_reveal: uniqueStrings(o.must_not_reveal, 8, 120) }
        : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeAgendaItems(raw: unknown): DirectorAgendaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectorAgendaItem[] = [];
  for (const x of raw) {
    const o = asRecord(x);
    if (!o) continue;
    const eventCode = sanitizeCode(o.event_code, "EV");
    const title = clampText(o.title, 120);
    const injectionHint = clampText(o.injection_hint, 360);
    if (!eventCode || !title || !injectionHint) continue;
    out.push({
      event_code: eventCode,
      title,
      due_in_turns: clampInt(o.due_in_turns, 0, 48, 1),
      ttl_turns: clampInt(o.ttl_turns, 1, 48, 6),
      priority: enumOr(o.priority, PRIORITIES, "low"),
      salience: clamp01(o.salience, o.priority === "high" ? 0.8 : 0.4),
      trigger_conditions: uniqueStrings(o.trigger_conditions, 8, 120),
      injection_hint: injectionHint,
      agency_constraints: uniqueStrings(o.agency_constraints, 8, 160),
      forbidden_outcomes: uniqueStrings(o.forbidden_outcomes, 8, 160),
      payload: asRecord(o.payload) ?? {},
    });
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeSeeds(raw: unknown): DirectorBranchSeed[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectorBranchSeed[] = [];
  for (const x of raw) {
    const o = asRecord(x);
    if (!o) continue;
    const seedCode = sanitizeCode(o.seed_code, "SEED");
    const summary = clampText(o.summary, 220);
    if (!seedCode || !summary) continue;
    out.push({
      seed_code: seedCode,
      summary,
      confidence: clamp01(o.confidence, 0),
      ...(o.reveal_policy ? { reveal_policy: enumOr(o.reveal_policy, REVEAL_POLICIES, "hold") } : {}),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeWarnings(raw: unknown): DirectorConsistencyWarning[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectorConsistencyWarning[] = [];
  for (const x of raw) {
    const o = asRecord(x);
    if (!o) continue;
    const code = sanitizeCode(o.code, "WARN");
    const message = clampText(o.message, 260);
    if (!code || !message) continue;
    out.push({ code, message, severity: enumOr(o.severity, PRIORITIES, "low") });
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeHooks(raw: unknown): DirectorPrivateHook[] {
  if (!Array.isArray(raw)) return [];
  const out: DirectorPrivateHook[] = [];
  for (const x of raw) {
    const o = asRecord(x);
    if (!o) continue;
    const hookCode = sanitizeCode(o.hook_code, "HOOK");
    const summary = clampText(o.summary, 220);
    if (!hookCode || !summary) continue;
    out.push({
      hook_code: hookCode,
      summary,
      ttl_turns: clampInt(o.ttl_turns, 1, 48, 6),
      must_not_surface_directly: true,
    });
    if (out.length >= 12) break;
  }
  return out;
}

function normalizePacing(raw: unknown): DirectorPacingAssessment {
  const o = asRecord(raw) ?? {};
  return {
    tension: clamp01(o.tension, 0.3),
    mystery: clamp01(o.mystery, 0.5),
    fatigue: clamp01(o.fatigue, 0.2),
    progress: clamp01(o.progress, 0.3),
    agency_health: clamp01(o.agency_health, 0.7),
    reveal_pressure: clamp01(o.reveal_pressure, 0.3),
  };
}

function normalizeRisk(raw: unknown): DirectorRiskAssessment {
  const o = asRecord(raw) ?? {};
  return {
    agency_risk: enumOr(o.agency_risk, RISK_LEVELS, "low"),
    continuity_risk: enumOr(o.continuity_risk, RISK_LEVELS, "low"),
    spoiler_risk: enumOr(o.spoiler_risk, RISK_LEVELS, "low"),
    safety_risk: enumOr(o.safety_risk, RISK_LEVELS, "low"),
  };
}

function normalizePlan(root: Record<string, unknown>): WorldEngineStructuredDelta {
  const risk = normalizeRisk(root.risk_assessment);
  const agendaRejectReasons: string[] = [];
  if (risk.agency_risk === "high") agendaRejectReasons.push("agency_risk_high");
  if (risk.spoiler_risk === "high") agendaRejectReasons.push("spoiler_risk_high");

  return {
    schema_version: "director_plan_v1",
    director_intent: clampText(root.director_intent, 300) || "Maintain pacing without reducing player agency.",
    current_phase: enumOr(root.current_phase, PHASES, "quiet"),
    target_phase: enumOr(root.target_phase, PHASES, "build_up"),
    pacing_assessment: normalizePacing(root.pacing_assessment),
    risk_assessment: risk,
    reveal_policy: enumOr(root.reveal_policy, REVEAL_POLICIES, "hint_only"),
    npc_next_actions: normalizeNpcActions(root.npc_next_actions),
    world_events_to_schedule: normalizeAgendaItems(root.world_events_to_schedule),
    story_branch_seeds: normalizeSeeds(root.story_branch_seeds),
    consistency_warnings: normalizeWarnings(root.consistency_warnings),
    player_private_hooks: normalizeHooks(root.player_private_hooks),
    agenda_write_allowed: agendaRejectReasons.length === 0,
    agenda_reject_reasons: agendaRejectReasons,
  };
}

export function parseWorldEngineDeltaJson(raw: string): WorldEngineStructuredDelta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  if (!root) return null;
  const schemaResult = directorPlanSchema.safeParse(root);
  if (!schemaResult.success) return null;
  return normalizePlan(schemaResult.data);
}

export type DirectorTriggerContext = {
  turnIndex: number;
  latestUserInput: string;
  playerLocation: string | null;
  previousPlayerLocation?: string | null;
  npcLocationUpdateCount: number;
  dmRecord: Record<string, unknown>;
  preflightRiskTags: string[];
  lastWorldEngineTurn?: number | null;
  pendingAgendaCount?: number;
  maxPendingAgenda?: number;
  minTriggerGapTurns?: number;
  progresslessTurnCount?: number;
  repeatedInvestigationCount?: number;
  dueHookCount?: number;
  dueNpcAgendaCount?: number;
  clueCount?: number;
  keyClueRank?: number;
  currentTension?: number | null;
  recentHighPressureTurns?: number;
};

function hasArrayField(record: Record<string, unknown>, key: string): boolean {
  return Array.isArray(record[key]) && (record[key] as unknown[]).length > 0;
}

export function detectWorldEngineTriggers(input: DirectorTriggerContext): WorldEngineTrigger[] {
  const out = new Set<WorldEngineTrigger>();
  const minGap = Math.max(0, Math.trunc(input.minTriggerGapTurns ?? 0));
  const lastTurn =
    typeof input.lastWorldEngineTurn === "number" && Number.isFinite(input.lastWorldEngineTurn)
      ? Math.trunc(input.lastWorldEngineTurn)
      : null;
  const pendingAgendaCount = Math.max(0, Math.trunc(input.pendingAgendaCount ?? 0));
  const maxPending = Math.max(1, Math.trunc(input.maxPendingAgenda ?? 9999));

  if (pendingAgendaCount >= maxPending) return [];
  if (lastTurn !== null && input.turnIndex - lastTurn < minGap) return [];

  if (input.turnIndex > 0 && input.turnIndex % 12 === 0) out.add("in_game_day_elapsed");
  if (input.npcLocationUpdateCount >= 2) out.add("important_npc_state_changed");

  const currentLocation = input.playerLocation?.trim() || null;
  const previousLocation = input.previousPlayerLocation?.trim() || null;
  if (currentLocation && previousLocation && currentLocation !== previousLocation) {
    out.add("multi_room_movement");
  }

  if (
    hasArrayField(input.dmRecord, "task_updates") ||
    hasArrayField(input.dmRecord, "new_tasks") ||
    hasArrayField(input.dmRecord, "clue_updates")
  ) {
    out.add("key_story_node_hit");
  }

  if (
    (input.clueCount ?? 0) >= 5 ||
    (input.keyClueRank ?? 0) >= 3 ||
    hasArrayField(input.dmRecord, "codex_updates")
  ) {
    out.add("clue_threshold_reached");
    out.add("world_fact_threshold_reached");
  }

  const latest = input.latestUserInput.toLowerCase();
  if (/线索|真相|幕后|clue|truth|behind/.test(latest)) out.add("key_story_node_hit");
  if ((input.progresslessTurnCount ?? 0) >= 4) out.add("plot_stagnation_detected");
  if ((input.repeatedInvestigationCount ?? 0) >= 3 || /反复|继续检查|再检查|观察|查看|检查/.test(latest)) {
    if ((input.progresslessTurnCount ?? 0) >= 2 || (input.repeatedInvestigationCount ?? 0) >= 2) {
      out.add("repeated_investigation_loop");
    }
  }
  if ((input.dueHookCount ?? 0) > 0) out.add("due_hook_reached");
  if ((input.dueNpcAgendaCount ?? 0) > 0) out.add("npc_agenda_due");

  const tension = typeof input.currentTension === "number" && Number.isFinite(input.currentTension)
    ? input.currentTension
    : null;
  if (tension !== null && tension <= 0.2 && (input.progresslessTurnCount ?? 0) >= 2) out.add("tension_too_low");
  if (tension !== null && tension >= 0.85 && (input.recentHighPressureTurns ?? 0) >= 2) out.add("tension_too_high");

  return [...out];
}

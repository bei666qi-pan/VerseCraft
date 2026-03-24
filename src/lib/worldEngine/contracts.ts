export type WorldEngineTrigger =
  | "in_game_day_elapsed"
  | "multi_room_movement"
  | "key_story_node_hit"
  | "important_npc_state_changed"
  | "world_fact_threshold_reached";

export type WorldEngineTickPayload = {
  requestId: string;
  userId: string | null;
  sessionId: string;
  latestUserInput: string;
  triggerSignals: WorldEngineTrigger[];
  controlRiskTags: string[];
  dmNarrativePreview: string;
  playerLocation: string | null;
  npcLocationUpdateCount: number;
  turnIndex: number;
  dedupKey: string;
  enqueuedAt: string;
};

export type WorldEngineStructuredDelta = {
  npc_next_actions: Array<{
    npc_code: string;
    action: string;
    urgency: "low" | "medium" | "high";
    eta_turns: number;
  }>;
  world_events_to_schedule: Array<{
    event_code: string;
    title: string;
    due_in_turns: number;
    priority: "low" | "medium" | "high";
    payload: Record<string, unknown>;
  }>;
  story_branch_seeds: Array<{
    seed_code: string;
    summary: string;
    confidence: number;
  }>;
  consistency_warnings: Array<{
    code: string;
    message: string;
    severity: "low" | "medium" | "high";
  }>;
  player_private_hooks: Array<{
    hook_code: string;
    summary: string;
    ttl_turns: number;
  }>;
};

function asObj(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asFiniteInt(v: unknown, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(0, Math.trunc(n));
}

function asConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asPriority(v: unknown): "low" | "medium" | "high" {
  return v === "high" || v === "medium" ? v : "low";
}

export function parseWorldEngineDeltaJson(raw: string): WorldEngineStructuredDelta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const root = asObj(parsed);
  if (!root) return null;
  const npc = Array.isArray(root.npc_next_actions) ? root.npc_next_actions : [];
  const ev = Array.isArray(root.world_events_to_schedule) ? root.world_events_to_schedule : [];
  const seeds = Array.isArray(root.story_branch_seeds) ? root.story_branch_seeds : [];
  const warns = Array.isArray(root.consistency_warnings) ? root.consistency_warnings : [];
  const hooks = Array.isArray(root.player_private_hooks) ? root.player_private_hooks : [];
  const out: WorldEngineStructuredDelta = {
    npc_next_actions: [],
    world_events_to_schedule: [],
    story_branch_seeds: [],
    consistency_warnings: [],
    player_private_hooks: [],
  };
  for (const x of npc) {
    const o = asObj(x);
    if (!o) continue;
    const npcCode = asString(o.npc_code);
    const action = asString(o.action);
    if (!npcCode || !action) continue;
    out.npc_next_actions.push({ npc_code: npcCode, action, urgency: asPriority(o.urgency), eta_turns: asFiniteInt(o.eta_turns, 1) });
  }
  for (const x of ev) {
    const o = asObj(x);
    if (!o) continue;
    const eventCode = asString(o.event_code);
    const title = asString(o.title);
    if (!eventCode || !title) continue;
    out.world_events_to_schedule.push({
      event_code: eventCode,
      title,
      due_in_turns: asFiniteInt(o.due_in_turns, 1),
      priority: asPriority(o.priority),
      payload: asObj(o.payload) ?? {},
    });
  }
  for (const x of seeds) {
    const o = asObj(x);
    if (!o) continue;
    const seedCode = asString(o.seed_code);
    const summary = asString(o.summary);
    if (!seedCode || !summary) continue;
    out.story_branch_seeds.push({ seed_code: seedCode, summary, confidence: asConfidence(o.confidence) });
  }
  for (const x of warns) {
    const o = asObj(x);
    if (!o) continue;
    const code = asString(o.code);
    const message = asString(o.message);
    if (!code || !message) continue;
    out.consistency_warnings.push({ code, message, severity: asPriority(o.severity) });
  }
  for (const x of hooks) {
    const o = asObj(x);
    if (!o) continue;
    const hookCode = asString(o.hook_code);
    const summary = asString(o.summary);
    if (!hookCode || !summary) continue;
    out.player_private_hooks.push({ hook_code: hookCode, summary, ttl_turns: asFiniteInt(o.ttl_turns, 3) });
  }
  return out;
}

export function detectWorldEngineTriggers(input: {
  turnIndex: number;
  latestUserInput: string;
  playerLocation: string | null;
  npcLocationUpdateCount: number;
  dmRecord: Record<string, unknown>;
  preflightRiskTags: string[];
}): WorldEngineTrigger[] {
  const out = new Set<WorldEngineTrigger>();
  if (input.turnIndex > 0 && input.turnIndex % 12 === 0) out.add("in_game_day_elapsed");
  if (input.npcLocationUpdateCount >= 2) out.add("important_npc_state_changed");
  if (input.playerLocation && input.playerLocation.trim().length > 0) out.add("multi_room_movement");
  if (Array.isArray(input.dmRecord.task_updates) && input.dmRecord.task_updates.length >= 1) out.add("key_story_node_hit");
  if (input.preflightRiskTags.some((x) => x === "violence" || x === "political")) out.add("world_fact_threshold_reached");
  const latest = input.latestUserInput.toLowerCase();
  if (latest.includes("线索") || latest.includes("真相") || latest.includes("幕后")) out.add("key_story_node_hit");
  return [...out];
}

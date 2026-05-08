import {
  NPC_AGENT_STATUSES,
  SOCIAL_ESCAPE_RELEVANCE,
  SOCIAL_EVENT_STATUSES,
  SOCIAL_EVENT_TYPES,
  SOCIAL_KNOWLEDGE_SCOPES,
  SOCIAL_PLAYER_RELEVANCE,
  SOCIAL_VISIBILITIES,
  type NpcAgentState,
  type NpcRelationDelta,
  type NpcRelationEdge,
  type NpcSocialAgendaItem,
  type SocialEvent,
  type SocialPriority,
} from "@/lib/socialWorld/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safe));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.trunc(clampNumber(value, min, max, fallback));
}

function clampText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

function uniqueStrings(value: unknown, cap: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = clampText(item, maxLen);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

function enumOr<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function enumOrEmpty<T extends string>(value: unknown, values: readonly T[]): T | "" {
  return values.includes(value as T) ? (value as T) : "";
}

function normalizePriority(value: unknown): SocialPriority {
  return enumOr(value, ["low", "medium", "high"] as const, "medium");
}

function normalizeAgendaItem(value: unknown, nowTurn: number): NpcSocialAgendaItem | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const code = clampText(raw.code, 80);
  const summary = clampText(raw.summary, 160);
  if (!code && !summary) return null;

  return {
    code: code || "agenda_unknown",
    summary,
    dueTurn: clampInt(raw.dueTurn, 0, 999999, nowTurn),
    priority: normalizePriority(raw.priority),
    relatedNpcIds: uniqueStrings(raw.relatedNpcIds, 8, 80),
    escapeRelevance: enumOr(raw.escapeRelevance, SOCIAL_ESCAPE_RELEVANCE, "none"),
  };
}

function normalizeAgenda(value: unknown, nowTurn: number): NpcSocialAgendaItem[] {
  if (!Array.isArray(value)) return [];
  const out: NpcSocialAgendaItem[] = [];
  for (const item of value) {
    const normalized = normalizeAgendaItem(item, nowTurn);
    if (!normalized) continue;
    out.push(normalized);
    if (out.length >= 12) break;
  }
  return out;
}

export function createEmptyNpcAgentState(npcId: string, nowTurn: number): NpcAgentState {
  const turn = clampInt(nowTurn, 0, 999999, 0);
  return {
    npcId: clampText(npcId, 80),
    status: "idle",
    currentGoal: null,
    currentFear: null,
    currentNeed: null,
    agenda: [],
    knownFactIds: [],
    suspectedFactIds: [],
    forbiddenRevealIds: [],
    socialEnergy: 0.5,
    volatility: 0,
    agencyWeight: 0.5,
    plotRelevance: 0,
    lastActiveTurn: turn,
    nextEligibleTurn: turn,
  };
}

export function normalizeNpcAgentState(raw: unknown, nowTurn: number): NpcAgentState {
  const record = asRecord(raw);
  const fallback = createEmptyNpcAgentState("", nowTurn);
  if (!record) return fallback;

  const goal = clampText(record.currentGoal, 120);
  const fear = clampText(record.currentFear, 120);
  const need = clampText(record.currentNeed, 120);

  return {
    npcId: clampText(record.npcId, 80),
    status: enumOr(record.status, NPC_AGENT_STATUSES, "idle"),
    currentGoal: goal || null,
    currentFear: fear || null,
    currentNeed: need || null,
    agenda: normalizeAgenda(record.agenda, nowTurn),
    knownFactIds: uniqueStrings(record.knownFactIds, 80, 120),
    suspectedFactIds: uniqueStrings(record.suspectedFactIds, 80, 120),
    forbiddenRevealIds: uniqueStrings(record.forbiddenRevealIds, 80, 120),
    socialEnergy: clampNumber(record.socialEnergy, 0, 1, fallback.socialEnergy),
    volatility: clampNumber(record.volatility, 0, 1, fallback.volatility),
    agencyWeight: clampNumber(record.agencyWeight, 0, 1, fallback.agencyWeight),
    plotRelevance: clampNumber(record.plotRelevance, 0, 1, fallback.plotRelevance),
    lastActiveTurn: clampInt(record.lastActiveTurn, 0, 999999, fallback.lastActiveTurn),
    nextEligibleTurn: clampInt(record.nextEligibleTurn, 0, 999999, fallback.nextEligibleTurn),
  };
}

export function normalizeNpcRelationEdge(raw: unknown): NpcRelationEdge {
  const record = asRecord(raw) ?? {};
  return {
    fromNpcId: clampText(record.fromNpcId, 80),
    toNpcId: clampText(record.toNpcId, 80),
    trust: clampNumber(record.trust, -1, 1, 0),
    fear: clampNumber(record.fear, -1, 1, 0),
    debt: clampNumber(record.debt, -1, 1, 0),
    resentment: clampNumber(record.resentment, -1, 1, 0),
    suspicion: clampNumber(record.suspicion, -1, 1, 0),
    lastInteractionTurn: clampInt(record.lastInteractionTurn, 0, 999999, 0),
    knownSharedFactIds: uniqueStrings(record.knownSharedFactIds, 80, 120),
    unresolvedTensionCodes: uniqueStrings(record.unresolvedTensionCodes, 20, 80),
    publicLabel: clampText(record.publicLabel, 80),
  };
}

export function normalizeNpcRelationDelta(raw: unknown): NpcRelationDelta {
  const record = asRecord(raw) ?? {};
  const delta: NpcRelationDelta = {
    fromNpcId: clampText(record.fromNpcId, 80),
    toNpcId: clampText(record.toNpcId, 80),
    reasonFactIds: uniqueStrings(record.reasonFactIds, 12, 120),
    summary: clampText(record.summary, 140),
  };
  for (const key of ["trust", "fear", "debt", "resentment", "suspicion"] as const) {
    if (record[key] !== undefined) delta[key] = clampNumber(record[key], -1, 1, 0);
  }
  return delta;
}

function normalizeRelationDeltas(value: unknown): NpcRelationDelta[] {
  if (!Array.isArray(value)) return [];
  const out: NpcRelationDelta[] = [];
  for (const item of value) {
    const delta = normalizeNpcRelationDelta(item);
    if (!delta.fromNpcId || !delta.toNpcId) continue;
    out.push(delta);
    if (out.length >= 12) break;
  }
  return out;
}

export function normalizeSocialEvent(raw: unknown): SocialEvent {
  const record = asRecord(raw) ?? {};
  const summaryForPlayer = clampText(record.summaryForPlayer, 160);

  return {
    id: clampText(record.id, 100) || "social_event_unknown",
    turn: clampInt(record.turn, 0, 999999, 0),
    dueTurn: clampInt(record.dueTurn ?? record.turn, 0, 999999, 0),
    expiresTurn:
      record.expiresTurn == null
        ? undefined
        : clampInt(record.expiresTurn, 0, 999999, clampInt(record.dueTurn ?? record.turn, 0, 999999, 0)),
    type: enumOr(record.type, SOCIAL_EVENT_TYPES, "conversation"),
    actorNpcIds: uniqueStrings(record.actorNpcIds, 8, 80),
    targetNpcIds: uniqueStrings(record.targetNpcIds, 8, 80),
    locationId: clampText(record.locationId, 100),
    visibility: enumOr(record.visibility, SOCIAL_VISIBILITIES, "private"),
    causeFactIds: uniqueStrings(record.causeFactIds, 20, 120),
    producedFactIds: uniqueStrings(record.producedFactIds, 20, 120),
    relationDeltas: normalizeRelationDeltas(record.relationDeltas),
    playerRelevance: enumOr(record.playerRelevance, SOCIAL_PLAYER_RELEVANCE, "none"),
    escapeRelevance: enumOr(record.escapeRelevance, SOCIAL_ESCAPE_RELEVANCE, "none"),
    knowledgeScope: enumOrEmpty(record.knowledgeScope, SOCIAL_KNOWLEDGE_SCOPES),
    mustNotReveal: uniqueStrings(record.mustNotReveal, 20, 120),
    summaryForModel: clampText(record.summaryForModel, 240),
    ...(summaryForPlayer ? { summaryForPlayer } : {}),
    status: enumOr(record.status, SOCIAL_EVENT_STATUSES, "candidate"),
  };
}

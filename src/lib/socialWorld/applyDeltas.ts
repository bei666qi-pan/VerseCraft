import type { MemorySpineEntry, MemorySpineKind, MemorySpineScope } from "@/lib/memorySpine/types";
import { NPCS } from "@/lib/registry/npcs";
import { normalizeSocialWorldBudget } from "@/lib/socialWorld/budget";
import type { SocialWorldPersistence } from "@/lib/socialWorld/persistence";
import {
  countPendingSocialEvents,
  insertSocialEvents,
  loadNpcAgentStates,
  loadNpcRelationEdges,
  loadRecentSocialEventsForCooldown,
  upsertMemorySpineEntries,
  upsertNpcAgentStates,
  upsertNpcRelationEdges,
} from "@/lib/socialWorld/persistence";
import {
  createEmptyNpcAgentState,
  normalizeNpcAgentState,
  normalizeNpcRelationEdge,
  normalizeSocialEvent,
} from "@/lib/socialWorld/state";
import type {
  NpcAgentState,
  NpcRelationDelta,
  NpcRelationEdge,
  SocialEvent,
  SocialValidationIssue,
  SocialWorldBudget,
  SocialWorldWriteResult,
} from "@/lib/socialWorld/types";
import { validateSocialEventCandidate } from "@/lib/socialWorld/validator";
import type {
  DirectorRiskAssessment,
  DirectorSocialEvent,
  NpcAgentPatch,
  NpcRelationDelta as DirectorNpcRelationDelta,
} from "@/lib/worldEngine/contracts";

export type SocialGmIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  eventCode?: string;
  field?: string;
};

export type SocialGmApplyResult = {
  acceptedEvents: SocialEvent[];
  rejectedEvents: Array<{ eventCode: string; issues: SocialGmIssue[] }>;
  issues: SocialGmIssue[];
  acceptedEventCodes: string[];
  rejectedEventCodes: string[];
  eventWrite: SocialWorldWriteResult;
  relationWrite: SocialWorldWriteResult;
  agentWrite: SocialWorldWriteResult;
  memoryWrite: SocialWorldWriteResult;
  memorySpineEntries: MemorySpineEntry[];
};

export type ApplySocialGmDeltasArgs = {
  sessionId: string;
  userId?: string | null;
  turnIndex: number;
  dedupKey: string;
  playerLocationId?: string | null;
  directorSocialEvents: readonly DirectorSocialEvent[];
  npcRelationDeltas?: readonly DirectorNpcRelationDelta[];
  npcAgentPatches?: readonly NpcAgentPatch[];
  riskAssessment?: DirectorRiskAssessment | null;
  acceptedSocialEventCodes?: readonly string[] | null;
  knownNpcIds?: readonly string[] | null;
  budget?: Partial<SocialWorldBudget> | null;
  cooldownTurns?: number;
  maxPendingEventsPerSession?: number;
  persistence?: SocialWorldPersistence;
};

const EMPTY_WRITE_RESULT: SocialWorldWriteResult = Object.freeze({ inserted: 0, updated: 0, skipped: 0 });
const SOCIAL_KNOWLEDGE_SCOPES = new Set(["actor_private", "scene_public", "rumor_network", "player_visible_hint"]);

const defaultPersistence: SocialWorldPersistence = {
  loadNpcAgentStates,
  upsertNpcAgentStates,
  loadNpcRelationEdges,
  upsertNpcRelationEdges,
  insertSocialEvents,
  loadDueSocialEventsForPrompt: async () => [],
  loadRecentSocialEventsForCooldown,
  countPendingSocialEvents,
  markSocialEventsProjected: async () => 0,
  expireOldSocialEvents: async () => 0,
  upsertMemorySpineEntries,
};

function clampText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

function payloadStrings(payload: Record<string, unknown>, keys: readonly string[], cap = 20): string[] {
  for (const key of keys) {
    const strings = uniqueStrings(payload[key], cap, 120);
    if (strings.length > 0) return strings;
  }
  return [];
}

function normalizeKnowledgeScope(scope: string): SocialEvent["knowledgeScope"] {
  const text = scope.trim();
  if (SOCIAL_KNOWLEDGE_SCOPES.has(text)) return text as SocialEvent["knowledgeScope"];
  const lower = text.toLocaleLowerCase();
  if (lower.includes("rumor")) return "rumor_network";
  if (lower.includes("scene") || lower.includes("public")) return "scene_public";
  if (lower.includes("player") || lower.includes("visible")) return "player_visible_hint";
  if (lower.includes("private") || lower.includes("actor")) return "actor_private";
  if (lower === "dmonly" || lower === "dm_only") return "dmOnly";
  return "";
}

function directorEventToSocialEvent(ev: DirectorSocialEvent, nowTurn: number): SocialEvent {
  const payload = asRecord(ev.payload) ?? {};
  const dueTurn = Math.max(0, nowTurn + Math.max(0, Math.trunc(ev.due_in_turns ?? 0)));
  const expiresTurn = dueTurn + Math.max(1, Math.trunc(ev.ttl_turns ?? 6));
  const playerSummary = clampText(
    payload.summaryForPlayer ?? payload.summary_for_player ?? payload.player_hint,
    160
  );

  return normalizeSocialEvent({
    id: ev.event_code,
    turn: nowTurn,
    dueTurn,
    expiresTurn,
    type: ev.type,
    actorNpcIds: ev.actor_npc_ids,
    targetNpcIds: ev.target_npc_ids,
    locationId: ev.location_id,
    visibility: ev.visibility,
    causeFactIds: payloadStrings(payload, ["causeFactIds", "cause_fact_ids", "fact_ids", "factIds"]),
    producedFactIds: payloadStrings(payload, ["producedFactIds", "produced_fact_ids"]),
    relationDeltas: [],
    playerRelevance: ev.player_relevance,
    escapeRelevance: ev.escape_relevance,
    knowledgeScope: normalizeKnowledgeScope(ev.knowledge_scope),
    mustNotReveal: ev.must_not_reveal,
    summaryForModel: ev.injection_hint,
    ...(ev.visibility !== "private" && playerSummary ? { summaryForPlayer: playerSummary } : {}),
    status: "candidate",
  });
}

function directorRelationDeltaToSocialDelta(delta: DirectorNpcRelationDelta, event: SocialEvent): NpcRelationDelta {
  const reason = clampText(delta.reason_code, 80) || event.id;
  const out: NpcRelationDelta = {
    fromNpcId: delta.from_npc_id,
    toNpcId: delta.to_npc_id,
    reasonFactIds: [reason, ...event.causeFactIds, ...event.producedFactIds].slice(0, 12),
    summary: reason,
  };
  if (delta.trust_delta !== undefined) out.trust = delta.trust_delta;
  if (delta.fear_delta !== undefined) out.fear = delta.fear_delta;
  if (delta.debt_delta !== undefined) out.debt = delta.debt_delta;
  if (delta.resentment_delta !== undefined) out.resentment = delta.resentment_delta;
  if (delta.suspicion_delta !== undefined) out.suspicion = delta.suspicion_delta;
  return out;
}

function socialPairKey(event: Pick<SocialEvent, "type" | "actorNpcIds" | "targetNpcIds">): string {
  const participants = [...new Set([...event.actorNpcIds, ...event.targetNpcIds])]
    .map((id) => id.trim())
    .filter(Boolean)
    .sort()
    .join("|");
  return `${event.type}:${participants}`;
}

function relationDeltaMatchesEvent(delta: DirectorNpcRelationDelta, event: SocialEvent): boolean {
  const participants = new Set([...event.actorNpcIds, ...event.targetNpcIds]);
  return participants.has(delta.from_npc_id) && participants.has(delta.to_npc_id);
}

function patchMatchesAcceptedEvent(patch: NpcAgentPatch, events: readonly SocialEvent[]): boolean {
  return events.some((event) => event.actorNpcIds.includes(patch.npc_id) || event.targetNpcIds.includes(patch.npc_id));
}

function riskBlocksSocial(risk: DirectorRiskAssessment | null | undefined): string[] {
  const reasons: string[] = [];
  if (!risk) return reasons;
  if (risk.agency_risk === "high") reasons.push("agency_risk_high");
  if (risk.spoiler_risk === "high") reasons.push("spoiler_risk_high");
  if (risk.safety_risk === "high") reasons.push("safety_risk_high");
  return reasons;
}

function payloadForcesEscapeEnding(payload: Record<string, unknown>): boolean {
  const raw = JSON.stringify(payload).slice(0, 2000);
  return /escapeMainline|escape mainline|final ending|final outcome|hasEscaped|settlement_ready|直接(改变|决定).{0,8}(结局|逃脱|失败)|最终结局|直接通关|直接逃脱/i.test(
    raw
  );
}

function gmIssue(
  code: string,
  severity: SocialGmIssue["severity"],
  message: string,
  eventCode?: string,
  field?: string
): SocialGmIssue {
  return { code, severity, message, ...(eventCode ? { eventCode } : {}), ...(field ? { field } : {}) };
}

function fromValidationIssue(issue: SocialValidationIssue, eventCode: string): SocialGmIssue {
  return gmIssue(issue.code, issue.severity, issue.message, eventCode, issue.field);
}

function knownNpcSet(args: {
  explicit?: readonly string[] | null;
  states: readonly NpcAgentState[];
  relations: readonly NpcRelationEdge[];
}): Set<string> {
  const ids = new Set<string>();
  for (const npc of NPCS) ids.add(npc.id);
  for (const id of args.explicit ?? []) if (id.trim()) ids.add(id.trim());
  for (const state of args.states) if (state.npcId) ids.add(state.npcId);
  for (const edge of args.relations) {
    if (edge.fromNpcId) ids.add(edge.fromNpcId);
    if (edge.toNpcId) ids.add(edge.toNpcId);
  }
  return ids;
}

function clampRelationValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function applyRelationDelta(edge: NpcRelationEdge, delta: NpcRelationDelta, nowTurn: number): NpcRelationEdge {
  const unresolved = new Set(edge.unresolvedTensionCodes);
  for (const reason of delta.reasonFactIds) {
    if (reason && ((delta.fear ?? 0) > 0 || (delta.resentment ?? 0) > 0 || (delta.suspicion ?? 0) > 0)) {
      unresolved.add(reason);
    }
  }
  return normalizeNpcRelationEdge({
    ...edge,
    trust: clampRelationValue(edge.trust + (delta.trust ?? 0)),
    fear: clampRelationValue(edge.fear + (delta.fear ?? 0)),
    debt: clampRelationValue(edge.debt + (delta.debt ?? 0)),
    resentment: clampRelationValue(edge.resentment + (delta.resentment ?? 0)),
    suspicion: clampRelationValue(edge.suspicion + (delta.suspicion ?? 0)),
    lastInteractionTurn: nowTurn,
    knownSharedFactIds: [...edge.knownSharedFactIds, ...delta.reasonFactIds],
    unresolvedTensionCodes: [...unresolved],
    publicLabel: edge.publicLabel || delta.summary,
  });
}

function applyAgentPatch(state: NpcAgentState, patch: NpcAgentPatch, nowTurn: number): NpcAgentState {
  const agenda = [...state.agenda];
  if (patch.next_action) {
    agenda.unshift({
      code: `director_${patch.npc_id}_${nowTurn}`.slice(0, 80),
      summary: patch.next_action,
      dueTurn: nowTurn + Math.max(0, Math.trunc(patch.eta_turns ?? 1)),
      priority: patch.urgency ?? "medium",
      relatedNpcIds: [],
      escapeRelevance: "none",
    });
  }
  return normalizeNpcAgentState(
    {
      ...state,
      status: patch.urgency === "high" ? "active" : "cooldown",
      currentGoal: patch.current_goal ?? state.currentGoal,
      agenda: agenda.slice(0, 12),
      forbiddenRevealIds: [...state.forbiddenRevealIds, ...(patch.must_not_reveal ?? [])],
      socialEnergy: Math.max(0, state.socialEnergy - 0.12),
      lastActiveTurn: nowTurn,
      nextEligibleTurn: nowTurn + Math.max(1, Math.trunc(patch.eta_turns ?? 1)),
    },
    nowTurn
  );
}

function memoryKindForEvent(event: SocialEvent, directorEvent: DirectorSocialEvent): MemorySpineKind {
  if (event.type === "debt_call") return "debt";
  if (event.type === "conflict") return "relationship_shift";
  if (event.type === "route_interference") {
    return event.escapeRelevance === "false_lead" ? "escape_condition" : "route_hint";
  }
  if (event.type === "warning" && event.visibility === "private") return "danger_hint";
  if (event.type === "rumor_spread") {
    if (event.escapeRelevance === "false_lead") return "escape_condition";
    if ((directorEvent.payload?.relation_shift ?? false) || event.relationDeltas.length > 0) return "relationship_shift";
    return "hook";
  }
  return "hook";
}

function memoryScopeForEvent(event: SocialEvent): MemorySpineScope {
  if (event.visibility === "private") return "run_private";
  if (event.locationId) return "location_local";
  return "session_world";
}

function buildMemorySpineEntry(args: {
  event: SocialEvent;
  directorEvent: DirectorSocialEvent;
  nowTurn: number;
}): MemorySpineEntry | null {
  if (args.directorEvent.salience < 0.7 && args.directorEvent.priority !== "high") return null;
  const kind = memoryKindForEvent(args.event, args.directorEvent);
  const falseLead = args.event.escapeRelevance === "false_lead";
  const summary = clampText(args.event.summaryForModel, 80);
  if (!summary) return null;
  const mergeKey = `social:${args.event.type}:${args.event.id}:${kind}`;
  return {
    id: `mem_${mergeKey}`.slice(0, 120),
    kind,
    scope: memoryScopeForEvent(args.event),
    summary,
    salience: Math.max(0.7, Math.min(1, args.directorEvent.salience)),
    confidence: args.event.visibility === "rumor" ? 0.55 : 0.78,
    status: "active",
    createdAtHour: args.nowTurn,
    lastTouchedAtHour: args.nowTurn,
    ttlHours: Math.max(1, Math.min(24 * 14, args.directorEvent.ttl_turns * 2)),
    mergeKey,
    anchors: {
      locationIds: args.event.locationId ? [args.event.locationId] : undefined,
      npcIds: [...new Set([...args.event.actorNpcIds, ...args.event.targetNpcIds])].slice(0, 8),
      worldFlags: [args.event.type, args.event.escapeRelevance].filter((x) => x !== "none"),
    },
    recallTags: [
      "social_world",
      args.event.type,
      args.event.visibility,
      args.event.escapeRelevance,
      ...(falseLead ? ["false_lead"] : []),
    ].filter((x) => x !== "none"),
    source: "system_hook",
    chapterRole: kind === "hook" || kind === "route_hint" ? "hook" : undefined,
    shouldAppearInRecap: args.directorEvent.salience >= 0.85,
    promoteToLore: false,
  };
}

function emptyResult(issueList: SocialGmIssue[] = []): SocialGmApplyResult {
  return {
    acceptedEvents: [],
    rejectedEvents: [],
    issues: issueList,
    acceptedEventCodes: [],
    rejectedEventCodes: [],
    eventWrite: { ...EMPTY_WRITE_RESULT },
    relationWrite: { ...EMPTY_WRITE_RESULT },
    agentWrite: { ...EMPTY_WRITE_RESULT },
    memoryWrite: { ...EMPTY_WRITE_RESULT },
    memorySpineEntries: [],
  };
}

export async function applySocialGmDeltas(args: ApplySocialGmDeltasArgs): Promise<SocialGmApplyResult> {
  const sessionId = args.sessionId.trim();
  const dedupKey = args.dedupKey.trim();
  if (!sessionId || !dedupKey) {
    return emptyResult([gmIssue("invalid_social_gm_context", "error", "Social GM requires sessionId and dedupKey.")]);
  }

  const persistence = args.persistence ?? defaultPersistence;
  const budget = normalizeSocialWorldBudget(args.budget);
  const nowTurn = Math.max(0, Math.trunc(args.turnIndex));
  const [states, relations, recentEvents, pendingEventCount] = await Promise.all([
    persistence.loadNpcAgentStates(sessionId),
    persistence.loadNpcRelationEdges(sessionId),
    persistence.loadRecentSocialEventsForCooldown?.(sessionId, nowTurn, args.cooldownTurns ?? 3) ?? [],
    persistence.countPendingSocialEvents?.(sessionId) ?? Promise.resolve(0),
  ]);
  const pendingLimit =
    args.maxPendingEventsPerSession === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.trunc(args.maxPendingEventsPerSession));
  const pendingCapacity = Number.isFinite(pendingLimit)
    ? Math.max(0, pendingLimit - Math.max(0, Math.trunc(Number(pendingEventCount) || 0)))
    : budget.maxSocialEventsPerTick;
  const maxAcceptedThisTick = Math.max(0, Math.min(budget.maxSocialEventsPerTick, pendingCapacity));
  const knownNpcIds = [...knownNpcSet({ explicit: args.knownNpcIds, states, relations })];
  const acceptedCodeFilter = args.acceptedSocialEventCodes ? new Set(args.acceptedSocialEventCodes) : null;
  const riskRejectReasons = riskBlocksSocial(args.riskAssessment);
  const issues: SocialGmIssue[] = [];
  const rejectedEvents: SocialGmApplyResult["rejectedEvents"] = [];
  const acceptedPairs = new Set<string>();
  const recentPairs = new Set(recentEvents.map((event) => socialPairKey(event)));
  const acceptedEventsWithDirector: Array<{ event: SocialEvent; directorEvent: DirectorSocialEvent }> = [];

  for (const directorEvent of args.directorSocialEvents.slice(0, 12)) {
    const eventCode = directorEvent.event_code;
    const eventIssues: SocialGmIssue[] = [];
    if (acceptedCodeFilter && !acceptedCodeFilter.has(eventCode)) {
      eventIssues.push(gmIssue("director_social_event_rejected", "error", "Director validation rejected this social event.", eventCode));
    }
    if (riskRejectReasons.length > 0) {
      eventIssues.push(
        gmIssue(
          "high_risk_social_event",
          "error",
          `High risk plan cannot commit social events: ${riskRejectReasons.join(", ")}`,
          eventCode
        )
      );
    }
    if (payloadForcesEscapeEnding(asRecord(directorEvent.payload) ?? {})) {
      eventIssues.push(
        gmIssue(
          "direct_escape_ending_mutation",
          "error",
          "Social events cannot directly mutate escapeMainline final outcome.",
          eventCode,
          "payload"
        )
      );
    }

    const candidate = directorEventToSocialEvent(directorEvent, nowTurn);
    const validation = validateSocialEventCandidate({
      event: candidate,
      knownNpcIds,
      npcStates: states,
      relationEdges: relations,
      playerLocationId: args.playerLocationId,
      nowTurn,
    });
    eventIssues.push(...validation.issues.map((issue) => fromValidationIssue(issue, eventCode)));

    const pairKey = socialPairKey(candidate);
    if (acceptedPairs.has(pairKey) || recentPairs.has(pairKey)) {
      eventIssues.push(
        gmIssue(
          "duplicate_social_pair_cooldown",
          "error",
          "Same NPC pair already has a recent social event and is in cooldown.",
          eventCode
        )
      );
    }
    if (maxAcceptedThisTick <= 0) {
      eventIssues.push(
        gmIssue(
          "social_pending_limit_reached",
          "error",
          "Session has reached the pending social event limit.",
          eventCode
        )
      );
    } else if (acceptedEventsWithDirector.length >= maxAcceptedThisTick) {
      eventIssues.push(
        gmIssue(
          "social_event_budget_exceeded",
          "error",
          "Single social tick exceeded maxSocialEventsPerTick.",
          eventCode
        )
      );
    }

    if (eventIssues.some((issue) => issue.severity === "error") || !validation.sanitizedEvent) {
      rejectedEvents.push({ eventCode, issues: eventIssues });
      issues.push(...eventIssues);
      continue;
    }

    const relationDeltas = (args.npcRelationDeltas ?? [])
      .filter((delta) => relationDeltaMatchesEvent(delta, validation.sanitizedEvent!))
      .map((delta) => directorRelationDeltaToSocialDelta(delta, validation.sanitizedEvent!));
    const committedEvent = normalizeSocialEvent({
      ...validation.sanitizedEvent,
      relationDeltas,
      status: "committed",
    });
    acceptedPairs.add(pairKey);
    acceptedEventsWithDirector.push({ event: committedEvent, directorEvent });
    issues.push(...eventIssues);
  }

  const acceptedEvents = acceptedEventsWithDirector.map((item) => item.event);
  if (acceptedEvents.length === 0) {
    return {
      ...emptyResult(issues),
      rejectedEvents,
      rejectedEventCodes: rejectedEvents.map((item) => item.eventCode),
    };
  }

  const eventWrite = await persistence.insertSocialEvents(sessionId, acceptedEvents, dedupKey, {
    userId: args.userId ?? null,
  });
  if (eventWrite.inserted <= 0) {
    return {
      acceptedEvents,
      rejectedEvents,
      issues,
      acceptedEventCodes: acceptedEvents.map((event) => event.id),
      rejectedEventCodes: rejectedEvents.map((item) => item.eventCode),
      eventWrite,
      relationWrite: { ...EMPTY_WRITE_RESULT },
      agentWrite: { ...EMPTY_WRITE_RESULT },
      memoryWrite: { ...EMPTY_WRITE_RESULT },
      memorySpineEntries: [],
    };
  }

  const relationByKey = new Map(relations.map((edge) => [`${edge.fromNpcId}->${edge.toNpcId}`, edge]));
  const changedRelations = new Map<string, NpcRelationEdge>();
  for (const event of acceptedEvents) {
    for (const delta of event.relationDeltas) {
      const key = `${delta.fromNpcId}->${delta.toNpcId}`;
      const prev = relationByKey.get(key) ?? normalizeNpcRelationEdge({ fromNpcId: delta.fromNpcId, toNpcId: delta.toNpcId });
      const next = applyRelationDelta(prev, delta, nowTurn);
      relationByKey.set(key, next);
      changedRelations.set(key, next);
    }
  }
  const relationWrite = await persistence.upsertNpcRelationEdges(sessionId, [...changedRelations.values()], {
    userId: args.userId ?? null,
  });

  const stateById = new Map(states.map((state) => [state.npcId, state]));
  const changedStates = new Map<string, NpcAgentState>();
  for (const patch of args.npcAgentPatches ?? []) {
    if (!knownNpcIds.includes(patch.npc_id) || !patchMatchesAcceptedEvent(patch, acceptedEvents)) continue;
    const prev = stateById.get(patch.npc_id) ?? createEmptyNpcAgentState(patch.npc_id, nowTurn);
    const next = applyAgentPatch(prev, patch, nowTurn);
    stateById.set(patch.npc_id, next);
    changedStates.set(patch.npc_id, next);
  }
  const agentWrite = await persistence.upsertNpcAgentStates(sessionId, [...changedStates.values()], {
    userId: args.userId ?? null,
  });

  const memorySpineEntries = acceptedEventsWithDirector
    .map((item) => buildMemorySpineEntry({ ...item, nowTurn }))
    .filter((entry): entry is MemorySpineEntry => Boolean(entry));
  const memoryWrite = await (persistence.upsertMemorySpineEntries?.(sessionId, memorySpineEntries, {
    userId: args.userId ?? null,
  }) ?? Promise.resolve({ ...EMPTY_WRITE_RESULT }));

  return {
    acceptedEvents,
    rejectedEvents,
    issues,
    acceptedEventCodes: acceptedEvents.map((event) => event.id),
    rejectedEventCodes: rejectedEvents.map((item) => item.eventCode),
    eventWrite,
    relationWrite,
    agentWrite,
    memoryWrite,
    memorySpineEntries,
  };
}

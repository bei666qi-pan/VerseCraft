import { projectSocialEventToPlayerHint } from "@/lib/socialWorld/projection";
import { normalizeSocialEvent } from "@/lib/socialWorld/state";
import type {
  NpcAgentState,
  NpcRelationEdge,
  SocialEvent,
  SocialValidationIssue,
  ValidateSocialEventCandidateArgs,
  ValidateSocialEventCandidateResult,
} from "@/lib/socialWorld/types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripForbiddenText(text: string | undefined, forbidden: readonly string[]): string | undefined {
  if (!text) return undefined;
  let out = text;
  for (const item of forbidden) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    out = out.replace(new RegExp(escapeRegExp(trimmed), "gi"), "");
  }
  out = out.replace(/\s+/g, " ").trim();
  return out || undefined;
}

function containsForbiddenText(text: string | undefined, forbidden: readonly string[]): boolean {
  if (!text) return false;
  const lower = text.toLocaleLowerCase();
  return forbidden.some((item) => {
    const trimmed = item.trim();
    return Boolean(trimmed) && lower.includes(trimmed.toLocaleLowerCase());
  });
}

function containsForcedPlayerFailure(event: SocialEvent): boolean {
  const text = [event.summaryForModel, event.summaryForPlayer, ...event.mustNotReveal].filter(Boolean).join(" ");
  return /玩家(必定|必须|一定|无法避免).{0,12}(失败|死亡|受伤|被抓|被困)|强制玩家(失败|死亡)|force(?:s|d)? player failure|forced player death|player must (fail|die)|unavoidable player failure/i.test(
    text
  );
}

function containsForcedEscapeEnding(event: SocialEvent): boolean {
  const text = [
    event.summaryForModel,
    event.summaryForPlayer,
    event.escapeRelevance,
    ...event.causeFactIds,
    ...event.producedFactIds,
  ]
    .filter(Boolean)
    .join(" ");
  return /escapeMainline|escape mainline|final ending|final outcome|hasEscaped|settlement_ready|直接(改变|决定).{0,8}(结局|逃脱|失败)|最终结局|直接通关|直接逃脱/i.test(
    text
  );
}

function withoutPlayerSummary(event: SocialEvent): SocialEvent {
  const next = { ...event };
  delete next.summaryForPlayer;
  return next;
}

function pushIssue(
  issues: SocialValidationIssue[],
  code: SocialValidationIssue["code"],
  severity: SocialValidationIssue["severity"],
  message: string,
  field?: string
): void {
  issues.push({ code, severity, message, ...(field ? { field } : {}) });
}

function byNpcId(states: readonly NpcAgentState[] | undefined): Map<string, NpcAgentState> {
  const out = new Map<string, NpcAgentState>();
  for (const state of states ?? []) {
    if (state.npcId) out.set(state.npcId, state);
  }
  return out;
}

function sharedFactsForActor(
  actorId: string,
  targetIds: readonly string[],
  relationEdges: readonly NpcRelationEdge[] | undefined
): Set<string> {
  const targets = new Set(targetIds);
  const facts = new Set<string>();
  for (const edge of relationEdges ?? []) {
    const actorMatches = edge.fromNpcId === actorId && targets.has(edge.toNpcId);
    const reverseMatches = edge.toNpcId === actorId && targets.has(edge.fromNpcId);
    if (!actorMatches && !reverseMatches) continue;
    for (const id of edge.knownSharedFactIds) facts.add(id);
  }
  return facts;
}

function scopeTextAllowsFact(scope: string, factId: string): boolean {
  if (!factId) return true;
  const lowerScope = scope.toLocaleLowerCase();
  const lowerFact = factId.toLocaleLowerCase();
  if (lowerScope.includes(lowerFact)) return true;
  if (scope === "scene_public") return /^(scene|public|location|ambient)[:._-]/i.test(factId);
  if (scope === "rumor_network") return /^(rumor|public|scene)[:._-]/i.test(factId);
  if (scope === "player_visible_hint") return /^(player_visible|public|scene|ambient)[:._-]/i.test(factId);
  return false;
}

function validateKnowledgeScope(
  event: SocialEvent,
  states: readonly NpcAgentState[] | undefined,
  relationEdges: readonly NpcRelationEdge[] | undefined,
  issues: SocialValidationIssue[]
): void {
  if (event.knowledgeScope === "dmOnly") {
    pushIssue(
      issues,
      "invalid_knowledge_scope",
      "error",
      "NPC social events cannot act from dmOnly knowledge.",
      "knowledgeScope"
    );
    return;
  }
  if (event.causeFactIds.length === 0 || !states || states.length === 0) return;

  const stateById = byNpcId(states);
  for (const actorId of event.actorNpcIds) {
    const state = stateById.get(actorId);
    if (!state) continue;
    const actorFacts = new Set([...state.knownFactIds, ...state.suspectedFactIds]);
    const sharedFacts = sharedFactsForActor(actorId, event.targetNpcIds, relationEdges);
    const missing = event.causeFactIds.filter(
      (factId) =>
        !actorFacts.has(factId) &&
        !sharedFacts.has(factId) &&
        !scopeTextAllowsFact(event.knowledgeScope, factId)
    );
    if (missing.length > 0) {
      pushIssue(
        issues,
        "knowledge_scope_violation",
        "error",
        `Actor ${actorId} cannot act on facts outside its knowledge scope: ${missing.slice(0, 3).join(", ")}`,
        "causeFactIds"
      );
    }
  }
}

function floorToken(locationId: string | null | undefined): string | null {
  const loc = String(locationId ?? "").trim();
  if (!loc) return null;
  const match = loc.match(/^(B\d+|\dF|\d\s*F|\d\s*楼|\d\s*妤|[1-7])[_\s-]?/i);
  if (!match) return null;
  return match[1]!.toUpperCase().replace(/\s+/g, "").replace(/楼|妤/g, "F");
}

function canPlayerPerceiveLocation(eventLocationId: string, playerLocationId: string | null | undefined): boolean {
  const eventLoc = eventLocationId.trim();
  const playerLoc = String(playerLocationId ?? "").trim();
  if (!eventLoc || !playerLoc) return false;
  if (eventLoc === playerLoc) return true;
  const eventFloor = floorToken(eventLoc);
  const playerFloor = floorToken(playerLoc);
  return Boolean(eventFloor && playerFloor && eventFloor === playerFloor);
}

export function validateSocialEventCandidate(
  args: ValidateSocialEventCandidateArgs
): ValidateSocialEventCandidateResult {
  const event = normalizeSocialEvent(args.event);
  const knownNpcIds = new Set(args.knownNpcIds.map((id) => id.trim()).filter(Boolean));
  const issues: SocialValidationIssue[] = [];

  if (event.actorNpcIds.length === 0) {
    pushIssue(issues, "missing_actor", "error", "Social event requires at least one actor NPC.", "actorNpcIds");
  }
  if (event.targetNpcIds.length === 0) {
    pushIssue(issues, "missing_target", "error", "Social event requires at least one target NPC.", "targetNpcIds");
  }

  for (const actorId of event.actorNpcIds) {
    if (!knownNpcIds.has(actorId)) {
      pushIssue(issues, "invalid_actor_npc", "error", `Unknown actor NPC id: ${actorId}`, "actorNpcIds");
    }
  }
  for (const targetId of event.targetNpcIds) {
    if (!knownNpcIds.has(targetId)) {
      pushIssue(issues, "invalid_target_npc", "error", `Unknown target NPC id: ${targetId}`, "targetNpcIds");
    }
  }

  if (!event.knowledgeScope) {
    pushIssue(issues, "missing_knowledge_scope", "error", "Social event requires knowledgeScope.", "knowledgeScope");
  }
  validateKnowledgeScope(event, args.npcStates, args.relationEdges, issues);

  let sanitizedEvent: SocialEvent = { ...event, mustNotReveal: [...event.mustNotReveal] };
  if (containsForbiddenText(event.summaryForModel, event.mustNotReveal)) {
    pushIssue(
      issues,
      "must_not_reveal_in_model_summary",
      "error",
      "summaryForModel/injection_hint contains text listed in mustNotReveal.",
      "summaryForModel"
    );
  }

  if (containsForbiddenText(event.summaryForPlayer, event.mustNotReveal)) {
    pushIssue(
      issues,
      "must_not_reveal_in_player_summary",
      "error",
      "summaryForPlayer contains text listed in mustNotReveal.",
      "summaryForPlayer"
    );
    const sanitizedSummary = stripForbiddenText(event.summaryForPlayer, event.mustNotReveal);
    sanitizedEvent = sanitizedSummary ? { ...sanitizedEvent, summaryForPlayer: sanitizedSummary } : withoutPlayerSummary(sanitizedEvent);
  }

  if (event.visibility === "private" && event.summaryForPlayer) {
    pushIssue(
      issues,
      "private_event_has_player_summary",
      "warning",
      "Private social events cannot carry player-visible summaries.",
      "summaryForPlayer"
    );
    sanitizedEvent = withoutPlayerSummary(sanitizedEvent);
  }

  if (event.visibility === "directly_observable") {
    if (!event.locationId) {
      pushIssue(
        issues,
        "directly_observable_missing_location",
        "error",
        "Directly observable social events require locationId.",
        "locationId"
      );
    } else if (!canPlayerPerceiveLocation(event.locationId, args.playerLocationId)) {
      pushIssue(
        issues,
        "directly_observable_location_downgraded",
        "warning",
        "Directly observable event is outside player perception and was downgraded to ambient.",
        "visibility"
      );
      sanitizedEvent = { ...sanitizedEvent, visibility: "ambient" };
    }
  }

  if (containsForcedPlayerFailure(event)) {
    pushIssue(
      issues,
      "forced_player_failure",
      "error",
      "Social events cannot force player failure or remove player agency.",
      "summaryForModel"
    );
  }
  if (containsForcedEscapeEnding(event)) {
    pushIssue(
      issues,
      "forced_player_failure",
      "error",
      "Social events cannot directly decide escapeMainline final outcome.",
      "escapeRelevance"
    );
  }

  const projected = projectSocialEventToPlayerHint(sanitizedEvent);
  if (event.visibility === "private" && projected) {
    pushIssue(
      issues,
      "private_event_projected",
      "error",
      "Private social events must not project into player prompt.",
      "visibility"
    );
  }
  if (containsForbiddenText(projected ?? undefined, event.mustNotReveal)) {
    pushIssue(
      issues,
      "must_not_reveal_in_projection",
      "error",
      "Player projection contains text listed in mustNotReveal.",
      "mustNotReveal"
    );
  }

  const accepted = !issues.some((issue) => issue.severity === "error");
  return {
    accepted,
    issues,
    sanitizedEvent: accepted ? sanitizedEvent : null,
  };
}

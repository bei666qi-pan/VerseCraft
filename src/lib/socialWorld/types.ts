export const NPC_AGENT_STATUSES = ["idle", "active", "cooldown", "blocked", "offscreen"] as const;
export type NpcAgentStatus = (typeof NPC_AGENT_STATUSES)[number];

export const SOCIAL_EVENT_TYPES = [
  "conversation",
  "rumor_spread",
  "conflict",
  "trade",
  "alliance",
  "betrayal",
  "warning",
  "rescue",
  "surveillance",
  "debt_call",
  "secret_transfer",
  "route_interference",
] as const;
export type SocialEventType = (typeof SOCIAL_EVENT_TYPES)[number];

export const SOCIAL_VISIBILITIES = ["private", "ambient", "rumor", "directly_observable"] as const;
export type SocialVisibility = (typeof SOCIAL_VISIBILITIES)[number];

export const SOCIAL_PLAYER_RELEVANCE = ["none", "low", "medium", "high"] as const;
export type SocialPlayerRelevance = (typeof SOCIAL_PLAYER_RELEVANCE)[number];

export const SOCIAL_ESCAPE_RELEVANCE = ["none", "route", "condition", "blocker", "false_lead"] as const;
export type SocialEscapeRelevance = (typeof SOCIAL_ESCAPE_RELEVANCE)[number];

export const SOCIAL_EVENT_STATUSES = ["candidate", "scheduled", "committed", "revealed", "expired"] as const;
export type SocialEventStatus = (typeof SOCIAL_EVENT_STATUSES)[number];
export type PersistedSocialEventStatus = SocialEventStatus | "rejected";

export const SOCIAL_KNOWLEDGE_SCOPES = [
  "dmOnly",
  "actor_private",
  "scene_public",
  "rumor_network",
  "player_visible_hint",
] as const;
export type SocialKnowledgeScope = (typeof SOCIAL_KNOWLEDGE_SCOPES)[number];

export type SocialPriority = "low" | "medium" | "high";

export type NpcSocialAgendaItem = {
  code: string;
  summary: string;
  dueTurn: number;
  priority: SocialPriority;
  relatedNpcIds: string[];
  escapeRelevance: SocialEscapeRelevance;
};

export type NpcAgentState = {
  npcId: string;
  status: NpcAgentStatus;
  currentGoal: string | null;
  currentFear: string | null;
  currentNeed: string | null;
  agenda: NpcSocialAgendaItem[];
  knownFactIds: string[];
  suspectedFactIds: string[];
  forbiddenRevealIds: string[];
  socialEnergy: number;
  volatility: number;
  agencyWeight: number;
  plotRelevance: number;
  lastActiveTurn: number;
  nextEligibleTurn: number;
};

export type NpcRelationEdge = {
  fromNpcId: string;
  toNpcId: string;
  trust: number;
  fear: number;
  debt: number;
  resentment: number;
  suspicion: number;
  lastInteractionTurn: number;
  knownSharedFactIds: string[];
  unresolvedTensionCodes: string[];
  publicLabel: string;
};

export type NpcRelationDelta = {
  fromNpcId: string;
  toNpcId: string;
  trust?: number;
  fear?: number;
  debt?: number;
  resentment?: number;
  suspicion?: number;
  reasonFactIds: string[];
  summary: string;
};

export type SocialEvent = {
  id: string;
  turn: number;
  dueTurn?: number;
  expiresTurn?: number;
  type: SocialEventType;
  actorNpcIds: string[];
  targetNpcIds: string[];
  locationId: string;
  visibility: SocialVisibility;
  causeFactIds: string[];
  producedFactIds: string[];
  relationDeltas: NpcRelationDelta[];
  playerRelevance: SocialPlayerRelevance;
  escapeRelevance: SocialEscapeRelevance;
  knowledgeScope: SocialKnowledgeScope | "";
  mustNotReveal: string[];
  summaryForModel: string;
  summaryForPlayer?: string;
  status: SocialEventStatus;
};

export type SocialWorldBudget = {
  maxTrackedNpc: number;
  defaultActiveNpcPerTick: number;
  maxActiveNpcPerTick: number;
  maxSocialEventsPerTick: number;
  maxVisibleSocialEventsPerTurn: number;
  maxSocialPromptChars: number;
  maxCharsPerSocialEvent: number;
};

export type SelectActiveNpcsForSocialTickArgs = {
  npcStates: readonly NpcAgentState[] | Record<string, NpcAgentState>;
  nowTurn: number;
  budget?: Partial<SocialWorldBudget> | null;
  desiredActiveNpcCount?: number;
  presentNpcIds?: readonly string[];
  dueAgendaNpcIds?: readonly string[];
  playerMentionedNpcIds?: readonly string[];
  recentRelationChangedNpcIds?: readonly string[];
  escapeRelevantNpcIds?: readonly string[];
  sameLocationNpcIds?: readonly string[];
  highRelevanceNpcIds?: readonly string[];
};

export type SocialValidationIssueCode =
  | "missing_actor"
  | "missing_target"
  | "invalid_actor_npc"
  | "invalid_target_npc"
  | "missing_knowledge_scope"
  | "invalid_knowledge_scope"
  | "knowledge_scope_violation"
  | "must_not_reveal_in_model_summary"
  | "must_not_reveal_in_player_summary"
  | "must_not_reveal_in_projection"
  | "private_event_has_player_summary"
  | "private_event_projected"
  | "directly_observable_missing_location"
  | "directly_observable_location_downgraded"
  | "forced_player_failure";

export type SocialValidationIssue = {
  code: SocialValidationIssueCode;
  severity: "error" | "warning";
  message: string;
  field?: string;
};

export type ValidateSocialEventCandidateArgs = {
  event: unknown;
  knownNpcIds: readonly string[];
  npcStates?: readonly NpcAgentState[];
  relationEdges?: readonly NpcRelationEdge[];
  playerLocationId?: string | null;
  nowTurn?: number;
};

export type ValidateSocialEventCandidateResult = {
  accepted: boolean;
  issues: SocialValidationIssue[];
  sanitizedEvent: SocialEvent | null;
};

export type SocialWorldWriteResult = {
  inserted: number;
  updated: number;
  skipped: number;
};

import type { AnalyticsPlatform } from "@/lib/analytics/types";
import type { EnhanceAfterMainStreamResult } from "@/lib/ai/logicalTasks";
import type { TurnMode } from "@/features/play/turnCommit/turnEnvelope";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import type { EpistemicValidatorTelemetry } from "@/lib/epistemic/validator";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

export type RiskLane = "fast" | "slow";

/**
 * Phase-2: "structured turn execution" lane.
 *
 * `RiskLane` ("fast" | "slow") controls *budget* concerns (TTFT, security depth).
 * `TurnLane` controls *semantic* execution concerns:
 *
 * - FAST   : trivial narrative step, no meaningful state delta expected
 *            (e.g. "\u7ee7\u7eed", "\u89c2\u5bdf\u5468\u56f4" when nothing has changed).
 *            Fast-path, skip heavy rule/reveal pipelines.
 * - RULE   : standard rule-driven turn (most play). Runs guards / validators /
 *            settlement / task updates normally.
 * - REVEAL : epistemic/knowledge reveal-heavy turn (interrogation, discovering
 *            clues, NPC breaking cover). Must route through epistemic filtering
 *            and post-generation validators.
 *
 * The routing is explicit and code-reviewable (see routeTurnLane.ts). The
 * narrative main model is NEVER allowed to implicitly choose the lane.
 */
export type TurnLane = "FAST" | "RULE" | "REVEAL";

export type TurnLaneReason =
  | "opening_first_action_constraint"
  | "system_transition_input"
  | "options_regen_only"
  | "explicit_reveal_intent"
  | "investigation_intent"
  | "dialogue_with_epistemic_focus"
  | "combat_intent"
  | "high_risk_tags"
  | "high_tension_director"
  | "fast_risk_lane"
  | "short_acknowledgement"
  | "default_rule";

export type TurnLaneDecision = {
  lane: TurnLane;
  reasons: TurnLaneReason[];
  /** non-authoritative confidence hint for analytics only */
  confidence: "low" | "medium" | "high";
};

/**
 * Strongly-typed player intent after server-side normalization.
 *
 * This is the *structured* input to the turn engine. It is NOT a replacement
 * for the raw `latestUserInput` that still feeds the main model prompt, but it
 * is the single authoritative source for downstream routing, guard decisions,
 * and state-delta synthesis.
 */
export type NormalizedPlayerIntentKind =
  | "explore"
  | "combat"
  | "dialogue"
  | "use_item"
  | "investigate"
  | "meta"
  | "system_transition"
  | "other";

export type NormalizedPlayerIntent = {
  /** Raw, moderated, anti-cheat-rewritten latest user input (length-clamped). */
  rawText: string;
  /** Sanitized/normalized form used for matching (lowercased, punctuation stripped). */
  normalizedText: string;
  /** Coarse semantic kind; derived from control preflight when available, else heuristics. */
  kind: NormalizedPlayerIntentKind;
  /** Extracted slots (propagated from control preflight when available). */
  slots: {
    target?: string;
    itemHint?: string;
    locationHint?: string;
  };
  /** Risk tags carried from control preflight / risk lane classifier. */
  riskTags: readonly string[];
  /**
   * Whether this turn is a "system transition" (end of day, resurrection,
   * settlement screen, etc.) — these must not consume normal narrative options.
   */
  isSystemTransition: boolean;
  /** Whether this is the opening "first action" round. */
  isFirstAction: boolean;
  /** Original client purpose. */
  clientPurpose: "normal" | "options_regen_only";
};

/**
 * Minimal but "structurally sufficient" state delta for the current turn.
 *
 * Goal: the narrative renderer consumes the delta instead of inventing state
 * from free-form narrative. This is the first-cut schema — cover the high
 * signal fields listed in the phase-2 brief.
 *
 * NOTE: All fields are optional and additive. Absent field = no change.
 */
export type StateDeltaLegalityReason =
  | "rule_snapshot_block"
  | "preflight_block_dm"
  | "anti_cheat_fallback"
  | "inventory_missing"
  | "weapon_not_equipped"
  | "location_unreachable"
  | "other";

export type StateDelta = {
  /** Whether the candidate action is legal. Null = unknown yet. */
  isActionLegal: boolean | null;
  /** When illegal, machine-readable reason code(s). */
  illegalReasons: readonly StateDeltaLegalityReason[];
  /** Whether the turn consumes in-world time. */
  consumesTime: boolean;
  /** Coarse time cost kind mirroring `turnEnvelope.time_cost`. */
  timeCost?: "free" | "light" | "standard" | "heavy" | "dangerous";
  /** Sanity damage (positive = lost sanity). */
  sanityDamage: number;
  /** HP / currency / resource deltas (all optional). */
  hpDelta?: number;
  originiumDelta?: number;
  /** Whether this turn kills the player. */
  isDeath: boolean;
  /** Explicit player location change. */
  playerLocation?: string;
  /** NPC location / attitude updates, as minimal structured rows. */
  npcLocationUpdates: Array<{
    npcId: string;
    location: string;
  }>;
  npcAttitudeUpdates: Array<{
    npcId: string;
    attitude: string;
    delta?: number;
  }>;
  /** Task ids touched this turn (id + next status). */
  taskUpdates: Array<{
    taskId: string;
    status?: string;
    note?: string;
  }>;
  /** New tasks introduced this turn (id + short title). */
  newTasks: Array<{
    taskId: string;
    title: string;
  }>;
  /** Whether the final turn must be degraded (e.g. safety block or illegal). */
  mustDegrade: boolean;
};

/**
 * Structured execution context for one online turn.
 *
 * Everything the turn-compiler needs to route, render and commit can be
 * derived from this (plus ambient IO helpers).
 */
export type TurnExecutionContext = {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  isFirstAction: boolean;
  shouldApplyFirstActionConstraint: boolean;
  clientPurpose: "normal" | "options_regen_only";
  clientState: ClientStructuredContextV1 | null;
  /** Raw player-facing context string used for prompt assembly. */
  playerContext: string;
  riskLane: RiskLane;
  pipelineRule: PlayerRuleSnapshot;
  pipelineControl: PlayerControlPlane | null;
  plannedTurnMode: TurnMode;
  /** Normalized intent; filled once we know moderated input + control plane. */
  intent: NormalizedPlayerIntent;
  /** Routed turn lane; filled after `routeTurnLane`. */
  lane: TurnLaneDecision;
};

/**
 * Final structured result of the turn engine.
 *
 * `envelope` is the resolved DM turn envelope that will be serialized to the
 * `__VERSECRAFT_FINAL__` frame. `delta` mirrors the minimal state delta we
 * extracted for downstream commit / analytics.
 */
export type TurnExecutionResult = {
  delta: StateDelta;
  /** The resolved DM envelope (produced by `resolveDmTurn`). */
  envelope: Record<string, unknown>;
  /** Whether narrative degradation was applied. */
  degraded: boolean;
  /** Free-form reasons for analytics (e.g. "settlement_guard", "protocol_guard"). */
  guardFlags: readonly string[];
};

export type ChatMessageShape = {
  role: string;
  content: string;
};

export type ChatPerfFlags = {
  enableRiskLaneSplit: boolean;
  enableLightweightFastPath: boolean;
  enablePromptSlimming: boolean;
  fastLaneSkipRuntimePackets: boolean;
  tieredContextBuild: boolean;
  controlPreflightBudgetMsCap: number;
  loreRetrievalBudgetMsCap: number;
};

export type TtftAggregatePoint = {
  t: number;
  totalTTFT: number;
  slowestStage: string;
  slowestMs: number;
};

export type ChatTtftProfile = {
  requestReceivedAt: number;
  jsonParseMs: number | null;
  authSessionMs: number | null;
  validateChatRequestMs: number | null;
  moderateInputOnServerMs: number | null;
  preInputModerationMs: number | null;
  quotaCheckMs: number | null;
  sessionMemoryReadMs: number | null;
  controlPreflightMs: number | null;
  loreRetrievalMs: number | null;
  promptBuildMs: number | null;
  generateMainReplyStartedAt: number | null;
  firstValidStreamChunkAt: number | null;
  firstSseWriteAt: number | null;
  lane: RiskLane;
};

export type TurnPreflightMetrics = {
  ran: boolean;
  skippedReason: string | null;
  cacheHit: boolean | null;
  latencyMs: number | null;
  ok: boolean;
  budgetHit: boolean;
};

export type PlannedTurnMode = {
  mode: TurnMode;
  reason: string;
};

export type UpstreamErrorFields = {
  upstreamHint?: string;
  upstreamCode?: string;
};

export type TurnRequestMetadata = {
  clientIp: string | null;
  requestId: string;
  platform: AnalyticsPlatform;
  requestStartedAt: number;
  isFirstAction: boolean;
  shouldApplyFirstActionConstraint: boolean;
};

export type StatusFrameStage =
  | "request_sent"
  | "routing"
  | "context_building"
  | "generating"
  | "streaming"
  | "finalizing";

export type ControlPreflightStageResult = {
  pipelineControl: PlayerControlPlane | null;
  pipelinePreflightFailed: boolean;
  controlPreflightBudgetHit: boolean;
  preflightTurnMetrics: TurnPreflightMetrics;
};

export type FinalizationMutableState = {
  enhancePathDmParsed: boolean;
  lastEnhanceAnalytics: EnhanceAfterMainStreamResult | null;
  finalJsonParseSuccess: boolean;
  settlementGuardApplied: boolean;
  settlementAwardPruned: number;
  epistemicPostValidatorTelemetry: EpistemicValidatorTelemetry | null;
};

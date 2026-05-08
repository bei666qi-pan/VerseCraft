import type { OperationMode } from "@/lib/ai/degrade/mode";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { TokenUsage } from "@/lib/ai/types/core";
import type { NarrativeExpansionTelemetry } from "@/lib/turnEngine/narrativeExpansion";
import type { NarrativeLengthTelemetry } from "@/lib/turnEngine/narrativeLengthTelemetry";

/** Coerce numeric usage fields for analytics JSON; invalid → null (never NaN). */
export function optionalFiniteInt(n: unknown): number | null {
  if (n == null) return null;
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return null;
  const t = Math.trunc(x);
  return t >= 0 ? t : null;
}

export type ChatRoutingSnapshot = {
  operationMode: OperationMode;
  intendedRole: AiLogicalRole;
  fallbackCount: number;
  actualLogicalRole?: AiLogicalRole;
};

export type PreflightTurnMetrics = {
  /** null when preflight was not invoked (skipped). */
  ran: boolean;
  skippedReason: string | null;
  cacheHit: boolean | null;
  latencyMs: number | null;
  ok: boolean;
  budgetHit: boolean;
};

export type EnhanceTurnMetrics = {
  attempted: boolean;
  outcome: "none" | "applied" | "skipped" | "error";
  skipReason: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

/** Map narrative-enhancement result (or null after unexpected early exit) to analytics fields. */
export function toEnhanceTurnMetrics(
  enhancePathEntered: boolean,
  res:
    | { kind: "applied"; wallMs: number; usage: TokenUsage | null }
    | { kind: "skipped"; reason: string; wallMs: number }
    | null
): EnhanceTurnMetrics {
  if (!enhancePathEntered) {
    return {
      attempted: false,
      outcome: "none",
      skipReason: null,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };
  }
  if (!res) {
    return {
      attempted: true,
      outcome: "error",
      skipReason: null,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };
  }
  if (res.kind === "applied") {
    return {
      attempted: true,
      outcome: "applied",
      skipReason: null,
      latencyMs: res.wallMs,
      promptTokens: optionalFiniteInt(res.usage?.promptTokens),
      completionTokens: optionalFiniteInt(res.usage?.completionTokens),
      totalTokens: optionalFiniteInt(res.usage?.totalTokens),
    };
  }
  if (res.reason === "exception") {
    return {
      attempted: true,
      outcome: "error",
      skipReason: "exception",
      latencyMs: res.wallMs,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };
  }
  return {
    attempted: true,
    outcome: "skipped",
    skipReason: res.reason,
    latencyMs: res.wallMs,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
  };
}

export type BuildChatRequestFinishedPayloadInput = {
  requestId: string;
  /** Logical role or label used for telemetry (often actual stream role). */
  model: string;
  gatewayModel?: string;
  success: boolean;
  firstChunkAt: number;
  requestStartedAt: number;
  finishedAt: number;
  isFirstAction: boolean;
  riskLane?: "fast" | "slow" | "unknown";
  routing: ChatRoutingSnapshot;
  stableCharLen: number;
  dynamicCharLen: number;
  promptVersion?: string | null;
  promptStablePrefixHash?: string | null;
  stableTokenEstimate?: number | null;
  dynamicTokenEstimate?: number | null;
  runtimePacketChars?: number;
  runtimePacketTokenEstimate?: number;
  latestUsage: TokenUsage | null;
  streamFinishReason?: string | null;
  preflight: PreflightTurnMetrics;
  enhance: EnhanceTurnMetrics;
  streamReconnectCount?: number;
  streamInterruptedCount?: number;
  streamEmptyCount?: number;
  upstreamConnectMs?: number | null;
  finalJsonParseSuccess?: boolean;
  settlementGuardApplied?: boolean;
  settlementAwardPruned?: number;
  statusFrameCount?: number;
  firstStatusMs?: number | null;
  firstVisibleTextMs?: number | null;
  finalMs?: number | null;
  narrativeChars?: number | null;
  optionsCount?: number | null;
  optionsQualityPass?: boolean | null;
  optionsRepairUsed?: boolean | null;
  optionsRepairMs?: number | null;
  fallbackUsed?: boolean | null;
  degradedMode?: boolean | null;
  longGapCount?: number | null;
  maxInterChunkGapMs?: number | null;
  promptBuildMs?: number | null;
  loreRetrievalMs?: number | null;
  retryCount?: number | null;
  errorType?: string | null;
  httpStatus?: number | null;
  upstreamStatus?: number | null;
  rateLimited?: boolean | null;
  narrativeLength?: NarrativeLengthTelemetry | null;
  narrativeExpansion?: NarrativeExpansionTelemetry | null;
};

/**
 * Single JSON-serializable payload for `chat_request_finished` analytics.
 * No user narrative or full playerContext — lengths and enums only.
 */
export function buildChatRequestFinishedPayload(
  input: BuildChatRequestFinishedPayloadInput
): Record<string, unknown> {
  const u = input.latestUsage;
  const promptTokens = optionalFiniteInt(u?.promptTokens);
  const completionTokens = optionalFiniteInt(u?.completionTokens);
  const totalFromUsage = optionalFiniteInt(u?.totalTokens);
  const totalTokens =
    totalFromUsage != null
      ? totalFromUsage
      : promptTokens != null && completionTokens != null
        ? promptTokens + completionTokens
        : null;
  const cachedPromptTokens = optionalFiniteInt(u?.cachedPromptTokens);
  const streamFinishReason =
    typeof input.streamFinishReason === "string" && input.streamFinishReason.trim()
      ? input.streamFinishReason.trim().slice(0, 64)
      : null;
  const narrativeLength = input.narrativeLength ?? null;
  const narrativeExpansion = input.narrativeExpansion ?? null;

  const ttft =
    input.firstChunkAt > 0 ? Math.max(0, input.firstChunkAt - input.requestStartedAt) : null;

  return {
    requestId: input.requestId,
    model: input.model,
    gatewayModelMain: input.gatewayModel ?? null,
    success: input.success,
    firstChunkLatencyMs: ttft,
    totalLatencyMs: Math.max(0, input.finishedAt - input.requestStartedAt),
    isFirstAction: input.isFirstAction,
    riskLane: input.riskLane ?? "unknown",
    aiOperationMode: input.routing.operationMode,
    aiIntendedRole: input.routing.intendedRole,
    aiFallbackCount: input.routing.fallbackCount,
    fallbackRate: input.routing.fallbackCount > 0 ? 1 : 0,
    aiActualLogicalRole: input.routing.actualLogicalRole ?? input.model,
    stableCharLen: input.stableCharLen,
    dynamicCharLen: input.dynamicCharLen,
    promptVersion: input.promptVersion ?? null,
    promptStablePrefixHash: input.promptStablePrefixHash ?? null,
    stableTokenEstimate: optionalFiniteInt(input.stableTokenEstimate),
    dynamicTokenEstimate: optionalFiniteInt(input.dynamicTokenEstimate),
    runtimePacketChars: optionalFiniteInt(input.runtimePacketChars),
    runtimePacketTokenEstimate: optionalFiniteInt(input.runtimePacketTokenEstimate),
    narrativeBudgetTier: narrativeLength?.narrativeBudgetTier ?? null,
    narrativeBudgetReasonCodes: narrativeLength?.narrativeBudgetReasonCodes ?? [],
    narrativeMinChars: optionalFiniteInt(narrativeLength?.narrativeMinChars),
    narrativeTargetChars: optionalFiniteInt(narrativeLength?.narrativeTargetChars),
    narrativeMaxChars: optionalFiniteInt(narrativeLength?.narrativeMaxChars),
    actualNarrativeChars: optionalFiniteInt(narrativeLength?.actualNarrativeChars),
    estimatedInfoBeats: optionalFiniteInt(narrativeLength?.estimatedInfoBeats),
    narrativeLengthSeverity: narrativeLength?.narrativeLengthSeverity ?? null,
    narrativeLengthIssueCodes: narrativeLength?.narrativeLengthIssueCodes ?? [],
    narrativeUnderMin: narrativeLength?.narrativeUnderMin ?? false,
    narrativeOverMax: narrativeLength?.narrativeOverMax ?? false,
    narrativeLengthStatus: narrativeLength?.narrativeLengthStatus ?? null,
    playerChatMaxTokens: optionalFiniteInt(narrativeLength?.playerChatMaxTokens),
    playerChatFinishReason: streamFinishReason,
    playerChatFinishReasonLength: streamFinishReason?.toLowerCase() === "length",
    playerChatUsageCaptured: Boolean(u),
    playerChatPromptTokens: promptTokens,
    playerChatCompletionTokens: completionTokens,
    playerChatTotalTokens: totalTokens,
    playerChatCachedTokens: cachedPromptTokens,
    narrativeExpansionTriggered: narrativeExpansion?.narrativeExpansionTriggered ?? false,
    narrativeExpansionSucceeded: narrativeExpansion?.narrativeExpansionSucceeded ?? false,
    narrativeExpansionSkippedReason: narrativeExpansion?.narrativeExpansionSkippedReason ?? null,
    narrativeExpansionLatencyMs: optionalFiniteInt(narrativeExpansion?.narrativeExpansionLatencyMs),
    narrativeBeforeChars: optionalFiniteInt(narrativeExpansion?.narrativeBeforeChars),
    narrativeAfterChars: optionalFiniteInt(narrativeExpansion?.narrativeAfterChars),
    promptTokens,
    completionTokens,
    totalTokens,
    cachedPromptTokens,
    preflightRan: input.preflight.ran,
    preflightSkippedReason: input.preflight.skippedReason,
    preflightCacheHit: input.preflight.cacheHit,
    preflightLatencyMs: input.preflight.latencyMs,
    preflightOk: input.preflight.ok,
    preflightBudgetHit: input.preflight.budgetHit,
    enhanceAttempted: input.enhance.attempted,
    enhanceOutcome: input.enhance.outcome,
    enhanceSkipReason: input.enhance.skipReason,
    enhanceLatencyMs: input.enhance.latencyMs,
    enhancePromptTokens: input.enhance.promptTokens,
    enhanceCompletionTokens: input.enhance.completionTokens,
    enhanceTotalTokens: input.enhance.totalTokens,
    streamReconnectCount: optionalFiniteInt(input.streamReconnectCount),
    streamInterruptedCount: optionalFiniteInt(input.streamInterruptedCount),
    streamEmptyCount: optionalFiniteInt(input.streamEmptyCount),
    upstreamConnectMs: optionalFiniteInt(input.upstreamConnectMs),
    emptyFirstChunkRate: (input.streamEmptyCount ?? 0) > 0 ? 1 : 0,
    finalJsonParseSuccess:
      typeof input.finalJsonParseSuccess === "boolean" ? input.finalJsonParseSuccess : null,
    settlementGuardApplied:
      typeof input.settlementGuardApplied === "boolean" ? input.settlementGuardApplied : null,
    settlementAwardPruned: optionalFiniteInt(input.settlementAwardPruned),
    statusFrameCount: optionalFiniteInt(input.statusFrameCount),
    statusShownRate: (input.statusFrameCount ?? 0) > 0 ? 1 : 0,
    firstStatusMs: optionalFiniteInt(input.firstStatusMs),
    firstVisibleTextMs: optionalFiniteInt(input.firstVisibleTextMs ?? ttft),
    finalMs: optionalFiniteInt(input.finalMs ?? Math.max(0, input.finishedAt - input.requestStartedAt)),
    narrativeChars: optionalFiniteInt(input.narrativeChars ?? narrativeLength?.actualNarrativeChars),
    optionsCount: optionalFiniteInt(input.optionsCount),
    optionsQualityPass: typeof input.optionsQualityPass === "boolean" ? input.optionsQualityPass : null,
    optionsRepairUsed: typeof input.optionsRepairUsed === "boolean" ? input.optionsRepairUsed : null,
    optionsRepairMs: optionalFiniteInt(input.optionsRepairMs),
    fallbackUsed: typeof input.fallbackUsed === "boolean" ? input.fallbackUsed : null,
    degradedMode: typeof input.degradedMode === "boolean" ? input.degradedMode : null,
    longGapCount: optionalFiniteInt(input.longGapCount),
    maxInterChunkGapMs: optionalFiniteInt(input.maxInterChunkGapMs),
    promptBuildMs: optionalFiniteInt(input.promptBuildMs),
    loreRetrievalMs: optionalFiniteInt(input.loreRetrievalMs),
    retryCount: optionalFiniteInt(input.retryCount),
    errorType: input.errorType ?? null,
    httpStatus: optionalFiniteInt(input.httpStatus),
    upstreamStatus: optionalFiniteInt(input.upstreamStatus),
    rateLimited: input.rateLimited === true,
    "gen_ai.client.token.usage": {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      total_tokens: totalTokens,
      cached_input_tokens: cachedPromptTokens,
    },
    "gen_ai.client.operation.duration": optionalFiniteInt(input.finalMs ?? Math.max(0, input.finishedAt - input.requestStartedAt)),
    "gen_ai.server.time_to_first_token": optionalFiniteInt(input.firstVisibleTextMs ?? ttft),
  };
}

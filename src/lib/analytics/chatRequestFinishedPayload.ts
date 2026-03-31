import type { OperationMode } from "@/lib/ai/degrade/mode";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { TokenUsage } from "@/lib/ai/types/core";

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
  runtimePacketChars?: number;
  runtimePacketTokenEstimate?: number;
  latestUsage: TokenUsage | null;
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
    runtimePacketChars: optionalFiniteInt(input.runtimePacketChars),
    runtimePacketTokenEstimate: optionalFiniteInt(input.runtimePacketTokenEstimate),
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
  };
}

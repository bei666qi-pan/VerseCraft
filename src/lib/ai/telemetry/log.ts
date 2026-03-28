// src/lib/ai/telemetry/log.ts
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { pushAiObservability } from "@/lib/ai/debug/observabilityRing";
import type { AIRequestContext, AiProviderId, TokenUsage } from "@/lib/ai/types/core";

export type AiLogPhase =
  | "start"
  | "retry"
  | "success"
  | "error"
  | "circuit_skip"
  | "fallback"
  | "stream_first_token"
  | "stream_complete"
  | "preflight_budget";

export interface AiCostRecord {
  requestId: string;
  task: AIRequestContext["task"];
  providerId: AiProviderId;
  logicalRole: AiLogicalRole;
  /** Optional upstream model name (debug; may be omitted in high-volume logs). */
  gatewayModel?: string;
  phase: AiLogPhase;
  latencyMs?: number;
  usage?: TokenUsage | null;
  httpStatus?: number;
  errorCode?: string;
  /** Truncated vendor/diagnostic text only — never user narrative. */
  message?: string;
  attempt?: number;
  stream?: boolean;
  cacheHit?: boolean;
  fallbackCount?: number;
  estCostUsd?: number;
  userId?: string | null;
  /** First model token / first SSE payload latency for PLAYER_CHAT streams. */
  ttftMs?: number;
  stableCharLen?: number;
  dynamicCharLen?: number;
  cachedPromptTokens?: number;
  retryCount?: number;
  failureScope?: "online" | "offline";
  jsonSanitized?: boolean;
  retrievalLatencyMs?: number;
  retrievalCacheHit?: boolean;
  retrievalSourceCounts?: Record<string, number>;
  retrievalScopeCounts?: Record<string, number>;
  lorePacketChars?: number;
  lorePacketTokenEstimate?: number;
  runtimePacketChars?: number;
  runtimePacketTokenEstimate?: number;
  fallbackRegistryUsed?: boolean;
  factIngestionCount?: number;
  factConflictCount?: number;
  privateFactHitCount?: number;
  /** Provider request body build (local CPU) */
  bodyBuildMs?: number;
  /** Provider init/header build (local CPU) */
  providerInitMs?: number;
}

function totalTokensOf(u: TokenUsage | null | undefined): number | undefined {
  if (!u) return undefined;
  const t = Number(u.totalTokens ?? 0);
  if (t > 0) return Math.trunc(t);
  const a = Number(u.promptTokens ?? 0) + Number(u.completionTokens ?? 0);
  return a > 0 ? Math.trunc(a) : undefined;
}

function shouldEmitConsole(phase: AiLogPhase): boolean {
  const level = resolveAiEnv().logLevel;
  if (level === "silent") return false;
  if (level === "error") return phase === "error";
  if (phase === "stream_complete") return false;
  if (phase === "stream_first_token") return level === "debug";
  if (phase === "preflight_budget") return level === "debug";
  return true;
}

function shouldRecordObservability(phase: AiLogPhase): boolean {
  const level = resolveAiEnv().logLevel;
  if (level === "silent") return false;
  if (level === "error") return phase === "error";
  return (
    phase === "success" ||
    phase === "error" ||
    phase === "stream_complete" ||
    phase === "stream_first_token" ||
    phase === "preflight_budget"
  );
}

/** Stable log envelope type for log drains / CI assertions. */
export const AI_TELEMETRY_LOG_TYPE = "ai.telemetry" as const;

/** Structured logs for observability + future billing pipelines. */
export function logAiTelemetry(rec: AiCostRecord): void {
  const payload = {
    type: AI_TELEMETRY_LOG_TYPE,
    ts: new Date().toISOString(),
    requestId: rec.requestId,
    task: rec.task,
    providerId: rec.providerId,
    logicalRole: rec.logicalRole,
    gatewayModel: rec.gatewayModel,
    phase: rec.phase,
    latencyMs: rec.latencyMs,
    usage: rec.usage,
    httpStatus: rec.httpStatus,
    errorCode: rec.errorCode,
    message: rec.message?.slice(0, 400),
    attempt: rec.attempt,
    stream: rec.stream,
    cacheHit: rec.cacheHit,
    fallbackCount: rec.fallbackCount,
    estCostUsd:
      rec.estCostUsd != null ? Math.round(rec.estCostUsd * 1_000_000) / 1_000_000 : undefined,
    ttftMs: rec.ttftMs,
    stableCharLen: rec.stableCharLen,
    dynamicCharLen: rec.dynamicCharLen,
    cachedPromptTokens: rec.cachedPromptTokens ?? rec.usage?.cachedPromptTokens,
    retryCount: rec.retryCount,
    failureScope: rec.failureScope,
    jsonSanitized: rec.jsonSanitized,
    retrievalLatencyMs: rec.retrievalLatencyMs,
    retrievalCacheHit: rec.retrievalCacheHit,
    retrievalSourceCounts: rec.retrievalSourceCounts,
    retrievalScopeCounts: rec.retrievalScopeCounts,
    lorePacketChars: rec.lorePacketChars,
    lorePacketTokenEstimate: rec.lorePacketTokenEstimate,
    runtimePacketChars: rec.runtimePacketChars,
    runtimePacketTokenEstimate: rec.runtimePacketTokenEstimate,
    fallbackRegistryUsed: rec.fallbackRegistryUsed,
    factIngestionCount: rec.factIngestionCount,
    factConflictCount: rec.factConflictCount,
    privateFactHitCount: rec.privateFactHitCount,
    bodyBuildMs: rec.bodyBuildMs,
    providerInitMs: rec.providerInitMs,
  };
  if (shouldEmitConsole(rec.phase)) {
    if (rec.phase === "error") {
      console.error(JSON.stringify(payload));
    } else {
      console.info(JSON.stringify(payload));
    }
  }

  if (shouldRecordObservability(rec.phase)) {
    pushAiObservability({
      requestId: rec.requestId,
      task: rec.task,
      logicalRole: rec.logicalRole,
      gatewayModel: rec.gatewayModel,
      providerId: rec.providerId,
      phase: rec.phase,
      latencyMs: rec.latencyMs,
      totalTokens: totalTokensOf(rec.usage),
      stream: rec.stream,
      cacheHit: rec.cacheHit,
      fallbackCount: rec.fallbackCount,
      estCostUsd: rec.estCostUsd,
      message: rec.message?.slice(0, 200),
      userId: rec.userId,
      ttftMs: rec.ttftMs,
      stableCharLen: rec.stableCharLen,
      dynamicCharLen: rec.dynamicCharLen,
      cachedPromptTokens: rec.cachedPromptTokens ?? rec.usage?.cachedPromptTokens,
      retryCount: rec.retryCount,
      failureScope: rec.failureScope,
      jsonSanitized: rec.jsonSanitized,
      retrievalLatencyMs: rec.retrievalLatencyMs,
      retrievalCacheHit: rec.retrievalCacheHit,
      retrievalSourceCounts: rec.retrievalSourceCounts,
      retrievalScopeCounts: rec.retrievalScopeCounts,
      lorePacketChars: rec.lorePacketChars,
      lorePacketTokenEstimate: rec.lorePacketTokenEstimate,
      runtimePacketChars: rec.runtimePacketChars,
      runtimePacketTokenEstimate: rec.runtimePacketTokenEstimate,
      fallbackRegistryUsed: rec.fallbackRegistryUsed,
      factIngestionCount: rec.factIngestionCount,
      factConflictCount: rec.factConflictCount,
      privateFactHitCount: rec.privateFactHitCount,
      bodyBuildMs: rec.bodyBuildMs,
      providerInitMs: rec.providerInitMs,
    });
  }
}

export function estimateCostTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(50, Math.ceil(text.length / 2.5));
}

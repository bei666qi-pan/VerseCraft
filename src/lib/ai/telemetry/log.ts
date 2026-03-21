// src/lib/ai/telemetry/log.ts
import type { AllowedModelId } from "@/lib/ai/models/registry";
import { pushAiObservability } from "@/lib/ai/debug/observabilityRing";
import type { AIRequestContext, AiProviderId, TokenUsage } from "@/lib/ai/types/core";

export type AiLogPhase = "start" | "retry" | "success" | "error" | "circuit_skip" | "fallback";

export interface AiCostRecord {
  requestId: string;
  task: AIRequestContext["task"];
  providerId: AiProviderId;
  modelId: AllowedModelId;
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
}

function totalTokensOf(u: TokenUsage | null | undefined): number | undefined {
  if (!u) return undefined;
  const t = Number(u.totalTokens ?? 0);
  if (t > 0) return Math.trunc(t);
  const a = Number(u.promptTokens ?? 0) + Number(u.completionTokens ?? 0);
  return a > 0 ? Math.trunc(a) : undefined;
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
    modelId: rec.modelId,
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
  };
  if (rec.phase === "error") {
    console.error(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }

  if (rec.phase === "success" || rec.phase === "error") {
    pushAiObservability({
      requestId: rec.requestId,
      task: rec.task,
      modelId: rec.modelId,
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
    });
  }
}

export function estimateCostTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(50, Math.ceil(text.length / 2.5));
}

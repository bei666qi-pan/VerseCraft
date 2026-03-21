// src/lib/ai/telemetry/log.ts
import "server-only";

import type { AllowedModelId } from "@/lib/ai/models/registry";
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
  message?: string;
  attempt?: number;
}

/** Structured logs for observability + future billing pipelines. */
export function logAiTelemetry(rec: AiCostRecord): void {
  const payload = {
    type: "ai.telemetry",
    ts: new Date().toISOString(),
    ...rec,
  };
  if (rec.phase === "error") {
    console.error(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }
}

export function estimateCostTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(50, Math.ceil(text.length / 2.5));
}

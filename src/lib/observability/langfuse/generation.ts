// src/lib/observability/langfuse/generation.ts
// Generation-level instrumentation for AI router calls.
// Companion to logAiTelemetry — maps AiCostRecord to Langfuse generation spans.

import type { GenerationMetadata } from "./types";
import { startGeneration, resetExportErrors } from "./tracing";
import type { AiCostRecord } from "@/lib/ai/telemetry/log";

/**
 * Active generation handles keyed by (requestId, logicalRole, attemptIndex).
 * Stored so the stream handler can finalize generations after stream completion.
 */
const activeGenerations = new Map<string, ReturnType<typeof startGeneration>>();

function generationKey(requestId: string, logicalRole: string, attempt: number): string {
  return `${requestId}:${logicalRole}:${attempt}`;
}

/**
 * Create or update a Langfuse generation from an AiCostRecord.
 * Called in parallel with logAiTelemetry.
 *
 * - phase "start": creates a new generation
 * - phase "success": updates and ends a streaming generation (non-stream ends immediately)
 * - phase "error": updates and ends with error
 * - phase "circuit_skip" / "fallback": creates a skipped generation entry
 */
export function recordAiGenerationMetric(rec: AiCostRecord): void {
  try {
    const name = `ai.${rec.logicalRole}`;
    const attempt = rec.attempt ?? 0;

    if (rec.phase === "start" || rec.phase === "circuit_skip" || rec.phase === "fallback") {
      const meta: GenerationMetadata = {
        name,
        requestId: rec.requestId,
        input: rec.inputSnapshot,
        output: rec.outputSnapshot,
        provider: rec.providerId,
        gatewayModel: rec.gatewayModel ?? "unknown",
        intendedRole: rec.logicalRole,
        actualRole: rec.logicalRole,
        attemptIndex: attempt,
        retryCount: rec.retryCount ?? 0,
        fallbackCount: rec.fallbackCount ?? 0,
        stream: rec.stream ?? false,
        cacheHit: rec.cacheHit ?? false,
        httpStatus: rec.httpStatus,
        finishReason: rec.finishReason ?? undefined,
        ttftMs: rec.ttftMs,
        totalLatencyMs: rec.latencyMs,
        promptTokens: rec.usage?.promptTokens,
        completionTokens: rec.usage?.completionTokens,
        totalTokens: rec.usage?.totalTokens,
        cachedPromptTokens: rec.cachedPromptTokens ?? rec.usage?.cachedPromptTokens,
        estCostUsd: rec.estCostUsd,
        toolCallCount: rec.toolCallCount,
        jsonSanitized: rec.jsonSanitized,
        success: false, // will be updated on success
        errorCode: rec.errorCode,
        errorClass: undefined,
      };

      if (rec.stream) {
        // For streaming: create the generation now, it will be finalized later
        const gen = startGeneration(meta);
        activeGenerations.set(generationKey(rec.requestId, rec.logicalRole, attempt), gen);
      } else {
        // For non-streaming skip/fallback: create and end immediately
        const gen = startGeneration(meta);
        gen.end({
          success: false,
          httpStatus: rec.httpStatus,
          errorCode: rec.errorCode,
        });
      }
    }

    if (rec.phase === "success" || rec.phase === "stream_complete") {
      const key = generationKey(rec.requestId, rec.logicalRole, attempt);
      const gen = activeGenerations.get(key);
      
      // For streaming: wait for stream_complete (has outputSnapshot).
      // The "success" phase from logAiTelemetry arrives first for streams
      // but lacks accumulated output — don't end the generation yet.
      if (rec.phase === "success" && rec.stream) {
        // Telemetry-only success event for streams; output will arrive via stream_complete
        return;
      }
      
      if (gen) {
        activeGenerations.delete(key);
        gen.end({
          success: true,
          output: rec.outputSnapshot,
          totalLatencyMs: rec.latencyMs,
          ttftMs: rec.ttftMs,
          promptTokens: rec.usage?.promptTokens,
          completionTokens: rec.usage?.completionTokens,
          totalTokens: rec.usage?.totalTokens,
          cachedPromptTokens: rec.cachedPromptTokens ?? rec.usage?.cachedPromptTokens,
          estCostUsd: rec.estCostUsd,
          finishReason: rec.finishReason ?? undefined,
          httpStatus: rec.httpStatus,
        });
      } else if (!rec.stream) {
        // Non-streaming success without prior start: create and end
        const meta: GenerationMetadata = {
          name,
          requestId: rec.requestId,
          provider: rec.providerId,
          gatewayModel: rec.gatewayModel ?? "unknown",
          intendedRole: rec.logicalRole,
          actualRole: rec.logicalRole,
          attemptIndex: attempt,
          retryCount: rec.retryCount ?? 0,
          fallbackCount: rec.fallbackCount ?? 0,
          stream: false,
          cacheHit: rec.cacheHit ?? false,
          httpStatus: rec.httpStatus,
          finishReason: rec.finishReason ?? undefined,
          ttftMs: rec.ttftMs,
          totalLatencyMs: rec.latencyMs,
          promptTokens: rec.usage?.promptTokens,
          completionTokens: rec.usage?.completionTokens,
          totalTokens: rec.usage?.totalTokens,
          cachedPromptTokens: rec.cachedPromptTokens ?? rec.usage?.cachedPromptTokens,
          estCostUsd: rec.estCostUsd,
          toolCallCount: rec.toolCallCount,
          jsonSanitized: rec.jsonSanitized,
          success: true,
          errorCode: undefined,
          errorClass: undefined,
        };
        const gen = startGeneration(meta);
        gen.end({ success: true });
      }
    }

    if (rec.phase === "error") {
      const key = generationKey(rec.requestId, rec.logicalRole, attempt);
      const gen = activeGenerations.get(key);
      if (gen) {
        activeGenerations.delete(key);
        gen.end({
          success: false,
          output: rec.outputSnapshot,
          httpStatus: rec.httpStatus,
          errorCode: rec.errorCode,
          finishReason: rec.finishReason ?? undefined,
          totalLatencyMs: rec.latencyMs,
        });
      } else {
        // Error without prior start: create and end
        const meta: GenerationMetadata = {
          name,
          requestId: rec.requestId,
          provider: rec.providerId,
          gatewayModel: rec.gatewayModel ?? "unknown",
          intendedRole: rec.logicalRole,
          actualRole: rec.logicalRole,
          attemptIndex: attempt,
          retryCount: rec.retryCount ?? 0,
          fallbackCount: rec.fallbackCount ?? 0,
          stream: rec.stream ?? false,
          cacheHit: false,
          httpStatus: rec.httpStatus,
          errorCode: rec.errorCode,
          errorClass: undefined,
          totalLatencyMs: rec.latencyMs,
          success: false,
        };
        const gen = startGeneration(meta);
        gen.end({ success: false });
      }
    }
  } catch {
    // Fail-open: Langfuse errors never propagate
  }
}

/**
 * Get a pending generation handle for finalization by the stream handler.
 */
export function getActiveGeneration(
  requestId: string,
  logicalRole: string,
  attempt: number
): ReturnType<typeof startGeneration> | undefined {
  return activeGenerations.get(generationKey(requestId, logicalRole, attempt));
}

/**
 * Finalize a streaming generation after the stream completes.
 */
export function finalizeStreamGeneration(
  requestId: string,
  logicalRole: string,
  attempt: number,
  meta: {
    ttftMs?: number;
    totalLatencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cachedPromptTokens?: number;
    estCostUsd?: number;
    finishReason?: string;
    httpStatus?: number;
  }
): void {
  try {
    const gen = getActiveGeneration(requestId, logicalRole, attempt);
    if (gen) {
      activeGenerations.delete(generationKey(requestId, logicalRole, attempt));
      gen.end({
        success: true,
        ...meta,
      });
    }
  } catch {
    // Fail-open
  }
}

/** For testing: clear all state */
export function resetGenerationState(): void {
  activeGenerations.clear();
  resetExportErrors();
}

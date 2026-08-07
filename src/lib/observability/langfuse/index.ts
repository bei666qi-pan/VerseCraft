// src/lib/observability/langfuse/index.ts
// Barrel export for the Langfuse observability module.
// Only re-exports the public API that business code should use.

// Types
export type {
  TracingAdapter,
  SpanHandle,
  GenerationHandle,
  LangfuseConfig,
  LangfuseScore,
  ScoreSource,
  TurnTraceMetadata,
  TurnFinalSummary,
  StageSpanMetadata,
  GenerationMetadata,
  PromptSourceMode,
} from "./types";

// No-op (always safe to import)
export { noopTracingAdapter } from "./noop";

// Config (always safe to import — reads env, no side effects)
export { getLangfuseConfig, isLangfuseReady, resetLangfuseConfig } from "./config";
export type { LangfuseConfig as LangfuseConfigType } from "./config";

// Privacy (always safe to import — pure functions)
export { hashIdentity, hashContent, isSensitiveKey, sanitizeAttributes } from "./privacy";

// Sampling (always safe to import — pure function)
export { shouldSample } from "./sampling";

// Tracing adapter (loads Langfuse SDK lazily)
// Primary API: createTracingAdapter() per request, registers in AsyncLocalStorage.
// Convenience functions (startTurnTrace etc.) use getCurrentAdapter() from storage.
export {
  createTracingAdapter,
  getTracingAdapter,
  getCurrentAdapter,
  startTurnTrace,
  startStageSpan,
  startGeneration,
  endTurnTrace,
  addTraceScore,
  getLangfuseTraceId,
  ensureLangfuseSdk,
} from "./tracing";

// Generation instrumentation
export {
  recordAiGenerationMetric,
  finalizeStreamGeneration,
  resetGenerationState,
} from "./generation";

// Prompt management
export { fetchPrompt, validatePromptShadow } from "./prompts";
export type { PromptFetchResult } from "./prompts";

// Scores
export { uploadScores, buildEvalScores, buildModelJudgeScore, buildHumanScore } from "./scores";

// Client lifecycle (only for instrumentation.ts)
export { initLangfuse, shutdownLangfuse } from "./client";

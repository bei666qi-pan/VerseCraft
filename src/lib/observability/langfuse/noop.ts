// src/lib/observability/langfuse/noop.ts
// No-op implementations of all tracing interfaces.
// Used when Langfuse is disabled, unconfigured, or has failed.

import type {
  GenerationHandle,
  GenerationMetadata,
  LangfuseScore,
  SpanHandle,
  StageSpanMetadata,
  TracingAdapter,
  TurnFinalSummary,
  TurnTraceMetadata,
} from "./types";

class NoopSpanHandle implements SpanHandle {
  end(): void { /* no-op */ }
  setAttributes(_attrs: Record<string, string | number | boolean>): void { /* no-op */ }
}

class NoopGenerationHandle implements GenerationHandle {
  end(_metadata?: Partial<GenerationMetadata>): void { /* no-op */ }
  setAttributes(_attrs: Record<string, string | number | boolean>): void { /* no-op */ }
}

const NOOP_SPAN = new NoopSpanHandle();
const NOOP_GENERATION = new NoopGenerationHandle();

export const noopTracingAdapter: TracingAdapter = {
  startTrace(_name: string, _metadata: TurnTraceMetadata): void { /* no-op */ },
  startSpan(_metadata: StageSpanMetadata): SpanHandle {
    return NOOP_SPAN;
  },
  startGeneration(_metadata: GenerationMetadata): GenerationHandle {
    return NOOP_GENERATION;
  },
  endTrace(_summary: TurnFinalSummary): void { /* no-op */ },
  addScore(_score: LangfuseScore): void { /* no-op */ },
};

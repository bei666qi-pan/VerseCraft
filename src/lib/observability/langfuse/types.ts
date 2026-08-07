// src/lib/observability/langfuse/types.ts
// Local type definitions for the Langfuse observability adapter.
// These are NOT re-exports from @langfuse/* — business code only depends on this module.

/** Source of a score per Langfuse API: API (programmatic), EVAL (model judge), or ANNOTATION (human review). */
export type ScoreSource = "API" | "EVAL" | "ANNOTATION";

/** A structured score to upload to Langfuse. */
export interface LangfuseScore {
  name: string;
  value: number | string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  source: ScoreSource;
  evaluator?: string;
  evaluatorVersion?: string;
  datasetId?: string;
  scenarioId?: string;
  comment?: string;
  /** true = higher is better; false = lower is better */
  higherIsBetter: boolean;
}

/** Trace-level metadata written once per /api/chat turn. */
export interface TurnTraceMetadata {
  requestId: string;
  userIdHash?: string;
  sessionIdHash?: string;
  task: string;
  environment: string;
  release?: string;
  clientPurpose?: string;
  riskLane?: string;
  isFirstAction?: boolean;
  operationMode?: string;
  promptVersion?: string;
  promptStablePrefixHash?: string;
  tags?: string[];
}

/** Final turn summary appended after resolveDmTurn. */
export interface TurnFinalSummary {
  finalJsonParsed: boolean;
  turnCommitted: boolean;
  narrativeCharLen: number;
  optionsCount: number;
  optionsQualityPass?: boolean;
  validatorIssueCount: number;
  validatorIssueCodes?: string[];
  npcConsistencyIssueCount: number;
  epistemicGateSummary?: string;
  fallbackUsed: boolean;
  degradedMode: boolean;
  firstStatusMs?: number;
  firstVisibleTextMs?: number;
  finalMs?: number;
  maxInterChunkGapMs?: number;
}

/** Generation-level metadata for a single model attempt. */
export interface GenerationMetadata {
  name: string;
  provider: string;
  gatewayModel: string;
  intendedRole: string;
  actualRole: string;
  attemptIndex: number;
  retryCount: number;
  fallbackCount: number;
  stream: boolean;
  cacheHit: boolean;
  requestId?: string;
  /** Prompt content — truncated on write. Server-only, never logged. */
  input?: unknown;
  /** Completion content — truncated on write. Server-only, never logged. */
  output?: unknown;
  httpStatus?: number;
  finishReason?: string;
  ttftMs?: number;
  totalLatencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedPromptTokens?: number;
  estCostUsd?: number;
  toolCallCount?: number;
  jsonSanitized?: boolean;
  success: boolean;
  errorCode?: string;
  errorClass?: string;
}

/** Span-level metadata for a workflow stage. */
export interface StageSpanMetadata {
  name: string;
  skippedReason?: string;
  status: "ok" | "error" | "cached" | "skipped" | "degraded";
  latencyMs?: number;
  errorCode?: string;
  cacheHit?: boolean;
  budgetHit?: boolean;
  resultSummary?: Record<string, string | number>;
}

/** Interface for the tracing adapter — implemented by both real and no-op. */
export interface TracingAdapter {
  startTrace(name: string, metadata: TurnTraceMetadata): void;
  startSpan(metadata: StageSpanMetadata): SpanHandle;
  startGeneration(metadata: GenerationMetadata): GenerationHandle;
  endTrace(summary: TurnFinalSummary): void;
  addScore(score: LangfuseScore): void;
}

export interface SpanHandle {
  end(): void;
  setAttributes(attrs: Record<string, string | number | boolean>): void;
}

export interface GenerationHandle extends SpanHandle {
  end(metadata?: Partial<GenerationMetadata>): void;
}

/** Prompt management modes. */
export type PromptSourceMode = "local" | "shadow" | "remote";

/** Langfuse configuration resolved from environment. */
export interface LangfuseConfig {
  enabled: boolean;
  publicKey?: string;
  secretKey?: string;
  baseUrl: string;
  environment: string;
  release?: string;
  sampleRate: number;
  captureContent: boolean;
  promptSource: PromptSourceMode;
  flushTimeoutMs: number;
  hashSalt: string;
  /** Enable Dashboard read access (independent of write-side `enabled`). */
  enableRead: boolean;
  /** Timeout in ms for read queries. */
  readTimeoutMs: number;
}

// ── Query Client Types (Langfuse Read API) ─────────────

/** Generic query result wrapper — all read operations fail-open. */
export interface QueryResult<T> {
  data: T;
  degraded: boolean;
  reason: string | null;
}

/** Lightweight trace summary for list views. */
export interface TraceListItem {
  id: string;
  name: string;
  userId: string | null;
  sessionId: string | null;
  timestamp: string;
  latency: number;
  totalTokens: number;
  totalCost: number;
  observationCount: number;
  scores: { name: string; value: number | string }[];
}

/** Full trace detail including observation tree and scores. */
export interface TraceDetail extends TraceListItem {
  observations: ObservationNode[];
  scoreList: LangfuseScore[];
}

/** Observation node in the trace tree. */
export interface ObservationNode {
  id: string;
  name: string;
  type: "GENERATION" | "SPAN" | "EVENT";
  startTime: string;
  endTime: string | null;
  model: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  inputCost: number;
  outputCost: number;
  parentObservationId: string | null;
}

/** Score statistics with trend data. */
export interface ScoreStats {
  name: string;
  dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  count: number;
  trend: { date: string; avg: number }[];
}

/** Daily metrics aggregation. */
export interface DailyMetrics {
  date: string;
  traceCount: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
}

/** Model performance aggregation. */
export interface ModelObservationStats {
  model: string;
  role: string;
  count: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  successRate: number;
  totalTokens: number;
  avgTokens: number;
  totalCost: number;
}

/** Cost breakdown by model/role. */
export interface CostBreakdown {
  model: string;
  role: string;
  totalCost: number;
  traceCount: number;
  tokenCount: number;
}

/** Query parameters for listTraces. */
export interface ListTracesParams {
  q?: string;
  model?: string;
  lane?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  page?: number;
  limit?: number;
}

/** Paginated result for trace lists. */
export interface PaginatedTraces {
  traces: TraceListItem[];
  total: number;
  page: number;
  limit: number;
}

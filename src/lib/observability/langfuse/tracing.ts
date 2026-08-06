// src/lib/observability/langfuse/tracing.ts
// Adapter layer for Langfuse tracing.
// Business code ONLY calls these functions — never imports @langfuse/* directly.
//
// Architecture:
// - createTracingAdapter() returns a per-request adapter and registers it in
//   AsyncLocalStorage so convenience functions (called from deep in the call
//   stack) reuse the same adapter without manual parameter threading.
// - Module-level startObservation() uses OTel context propagation, so child
//   spans/generations are properly parented to the root span created by startTrace.
// - Fail-open: all errors are caught and logged; Langfuse unavailability never
//   affects the application.
import "server-only";

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
import { shouldSample } from "./sampling";
import { hashIdentity, sanitizeAttributes } from "./privacy";
import { noopTracingAdapter } from "./noop";
import { isLangfuseReady } from "./config";
import { AsyncLocalStorage } from "node:async_hooks";

// ----- Runtime state -----

let _exportErrors = 0;
let _lastExportErrorTime = 0;
let _sdkLoaded = false;

const traceRoots = new Map<string, import("@langfuse/tracing").LangfuseSpan>();

// Use globalThis for HMR survival (Next.js dev mode replaces module instances)
const _g = globalThis as typeof globalThis & { __vcTraceIdMap?: Map<string, string> };
if (!_g.__vcTraceIdMap) _g.__vcTraceIdMap = new Map();
const traceIdMap = _g.__vcTraceIdMap;

/** Per-request adapter registry keyed by requestId.
 *  AsyncLocalStorage can lose context in Next.js deep async chains;
 *  the registry provides a reliable fallback. */
const adapterRegistry = new Map<string, TracingAdapter>();

/** Per-request adapter storage — convenience functions use this to find the active adapter. */
const adapterStorage = new AsyncLocalStorage<TracingAdapter>();

/** Rate-limit export error logging to once per 30s. */
function logExportError(err: unknown): void {
  const now = Date.now();
  if (now - _lastExportErrorTime > 30_000 && _exportErrors < 10) {
    _exportErrors++;
    _lastExportErrorTime = now;
    console.error("[langfuse] export error", err instanceof Error ? err.message : String(err));
  }
}

export function resetExportErrors(): void {
  _exportErrors = 0;
  _lastExportErrorTime = 0;
}

type LangfuseSpan = import("@langfuse/tracing").LangfuseSpan;
type LangfuseGeneration = import("@langfuse/tracing").LangfuseGeneration;

// ----- SDK lazy-loading (shared, loaded once) -----

 
let _startObservation: any = null;
let _sdkLoadPromise: Promise<boolean> | null = null;

async function ensureSdk(): Promise<boolean> {
  if (_sdkLoaded) return true;
  if (!_sdkLoadPromise) {
    _sdkLoadPromise = (async () => {
      try {
        const mod = await import("@langfuse/tracing");
        _startObservation = mod.startObservation;
        _sdkLoaded = true;
        return true;
      } catch (err) {
        logExportError(err);
        return false;
      }
    })();
  }
  return _sdkLoadPromise;
}

function getStartObservation(): any {
  if (!_startObservation) throw new Error("Langfuse SDK not loaded");
  return _startObservation;
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch (err) { logExportError(err); return fallback; }
}

// ----- Real adapter (created per request) -----

function createRealAdapter(): TracingAdapter {
  let _traceStarted = false;
  let _traceRequestId = "";

  const self: TracingAdapter = {
    startTrace(_name: string, metadata: TurnTraceMetadata): void {
      if (!shouldSample(metadata.requestId)) return;
      _traceStarted = true;
      _traceRequestId = metadata.requestId;
      adapterRegistry.set(metadata.requestId, self);

      // If SDK is pre-loaded (via ensureLangfuseSdk), create root span synchronously
      // so versecraft.chat.turn is the first span exported — not the HTTP auto-instrumentation.
      if (_sdkLoaded && _startObservation) {
        safe(() => {
          const userIdHash = hashIdentity(metadata.userIdHash);
          const sessionIdHash = hashIdentity(metadata.sessionIdHash);
          const root = _startObservation("versecraft.chat.turn", {
            sessionId: sessionIdHash,
            userId: userIdHash,
            metadata: {
              requestId: metadata.requestId,
              task: metadata.task,
              environment: metadata.environment,
              ...(metadata.release ? { release: metadata.release } : {}),
              ...(metadata.clientPurpose ? { clientPurpose: metadata.clientPurpose } : {}),
              ...(metadata.riskLane ? { riskLane: metadata.riskLane } : {}),
              ...(metadata.isFirstAction !== undefined ? { isFirstAction: String(metadata.isFirstAction) } : {}),
              ...(metadata.operationMode ? { operationMode: metadata.operationMode } : {}),
              ...(metadata.promptVersion ? { promptVersion: metadata.promptVersion } : {}),
              ...(metadata.promptStablePrefixHash ? { promptStablePrefixHash: metadata.promptStablePrefixHash } : {}),
              ...(userIdHash ? { userId: userIdHash } : {}),
              ...(sessionIdHash ? { sessionId: sessionIdHash } : {}),
            },
            version: metadata.promptVersion,
          }, { asType: "span" });
          if (metadata.tags?.length) {
            root.update({ metadata: { tags: metadata.tags.join(",") } });
          }
          traceRoots.set(metadata.requestId, root);
          // Store trace ID for downstream lookup (getLangfuseTraceId)
          // Langfuse SDK stores the OTel span internally as otelSpan.spanContext()
          const rawCtx = (root as any).otelSpan?.spanContext?.();
          if (rawCtx?.traceId) {
            traceIdMap.set(metadata.requestId, rawCtx.traceId);
          }
        }, undefined);
        return;
      }

      // Fallback async load for first request when SDK not yet loaded
      void (async () => {
        if (!(await ensureSdk())) return;
        safe(() => {
          const startObservation = getStartObservation();
          const userIdHash = hashIdentity(metadata.userIdHash);
          const sessionIdHash = hashIdentity(metadata.sessionIdHash);
          const root = startObservation("versecraft.chat.turn", {
            sessionId: sessionIdHash,
            userId: userIdHash,
            metadata: {
              requestId: metadata.requestId,
              task: metadata.task,
              environment: metadata.environment,
              ...(metadata.release ? { release: metadata.release } : {}),
              ...(metadata.clientPurpose ? { clientPurpose: metadata.clientPurpose } : {}),
              ...(metadata.riskLane ? { riskLane: metadata.riskLane } : {}),
              ...(metadata.isFirstAction !== undefined ? { isFirstAction: String(metadata.isFirstAction) } : {}),
              ...(metadata.operationMode ? { operationMode: metadata.operationMode } : {}),
              ...(metadata.promptVersion ? { promptVersion: metadata.promptVersion } : {}),
              ...(metadata.promptStablePrefixHash ? { promptStablePrefixHash: metadata.promptStablePrefixHash } : {}),
              ...(userIdHash ? { userId: userIdHash } : {}),
              ...(sessionIdHash ? { sessionId: sessionIdHash } : {}),
            },
            version: metadata.promptVersion,
          }, { asType: "span" });
          if (metadata.tags?.length) {
            root.update({ metadata: { tags: metadata.tags.join(",") } });
          }
          traceRoots.set(metadata.requestId, root);
          // Store trace ID for downstream lookup (getLangfuseTraceId)
          if (root.spanContext) {
            const ctx = typeof root.spanContext === "function" ? root.spanContext() : root.spanContext;
            if (ctx?.traceId) traceIdMap.set(metadata.requestId, ctx.traceId);
          }
        }, undefined);
      })();
    },

    startSpan(metadata: StageSpanMetadata): SpanHandle {
      if (!_startObservation) return noopTracingAdapter.startSpan(metadata);
      const rootSpan = traceRoots.get(_traceRequestId);
      if (!rootSpan) return noopTracingAdapter.startSpan(metadata);

      let ended = false;
      try {
        const span = rootSpan.startObservation(metadata.name, {
          metadata: sanitizeAttributes({
            ...(metadata.skippedReason ? { skippedReason: metadata.skippedReason } : {}),
            ...(metadata.cacheHit !== undefined ? { cacheHit: String(metadata.cacheHit) } : {}),
            ...(metadata.budgetHit !== undefined ? { budgetHit: String(metadata.budgetHit) } : {}),
          } as Record<string, unknown>) as Record<string, unknown>,
          level: metadata.status === "error" ? "ERROR" : "DEFAULT",
          statusMessage: metadata.errorCode,
          ...(metadata.resultSummary ? { output: metadata.resultSummary } : {}),
        }, { asType: "span" });

        if (ended) span.end();

        return {
          end(): void { ended = true; span.end(); },
          setAttributes(_attrs: Record<string, string | number | boolean>): void {},
        };
      } catch (err) {
        logExportError(err);
        return noopTracingAdapter.startSpan(metadata);
      }
    },

    startGeneration(metadata: GenerationMetadata): GenerationHandle {
      // Bypass adapter closure state — look up rootSpan directly from traceRoots.
      // _traceStarted is unreliable in Next.js webpack-compiled closures.
      const lookups = [metadata.requestId, _traceRequestId].filter(Boolean) as string[];
      let rootSpan: LangfuseSpan | undefined;
      for (const id of lookups) {
        rootSpan = traceRoots.get(id);
        if (rootSpan) break;
      }
      if (!rootSpan) return noopTracingAdapter.startGeneration(metadata);
      if (!_startObservation) return noopTracingAdapter.startGeneration(metadata);

      try {
        const gen = rootSpan.startObservation(metadata.name, {
          model: metadata.gatewayModel,
          modelParameters: {
            provider: metadata.provider,
            intendedRole: metadata.intendedRole,
            actualRole: metadata.actualRole,
            attempt: String(metadata.attemptIndex),
            retry: String(metadata.retryCount),
            stream: String(metadata.stream),
          },
          usageDetails: {
            ...(metadata.promptTokens != null ? { input: metadata.promptTokens } : {}),
            ...(metadata.completionTokens != null ? { output: metadata.completionTokens } : {}),
            ...(metadata.totalTokens != null ? { total: metadata.totalTokens } : {}),
            ...(metadata.cachedPromptTokens != null ? { cachedInputTokens: metadata.cachedPromptTokens } : {}),
          },
          costDetails: metadata.estCostUsd != null ? { total: metadata.estCostUsd } : undefined,
          metadata: {
            provider: metadata.provider,
            httpStatus: String(metadata.httpStatus ?? "N/A"),
            finishReason: metadata.finishReason ?? "N/A",
            ttftMs: String(metadata.ttftMs ?? "N/A"),
            totalLatencyMs: String(metadata.totalLatencyMs ?? "N/A"),
            retryCount: String(metadata.retryCount),
            fallbackCount: String(metadata.fallbackCount),
            cacheHit: String(metadata.cacheHit),
            toolCallCount: String(metadata.toolCallCount ?? 0),
            jsonSanitized: String(metadata.jsonSanitized ?? false),
            errorCode: metadata.errorCode ?? "N/A",
            errorClass: metadata.errorClass ?? "N/A",
          },
          level: metadata.success ? "DEFAULT" : "ERROR",
          statusMessage: metadata.errorCode,
        }, { asType: "generation" });

        return {
          end(update?: Partial<GenerationMetadata>): void {
            safe(() => {
              if (update) {
                gen.update({
                  ...(update.finishReason !== undefined ? { metadata: { finishReason: update.finishReason } } : {}),
                  ...(update.totalLatencyMs !== undefined ? { metadata: { totalLatencyMs: String(update.totalLatencyMs) } } : {}),
                  ...(update.usageDetails ? {
                    usageDetails: {
                      ...(update.promptTokens != null ? { input: update.promptTokens } : {}),
                      ...(update.completionTokens != null ? { output: update.completionTokens } : {}),
                      ...(update.totalTokens != null ? { total: update.totalTokens } : {}),
                    },
                  } : {}),
                  level: update.success === false ? "ERROR" : "DEFAULT",
                });
              }
              gen.end();
            }, undefined);
          },
          setAttributes(attrs: Record<string, string | number | boolean>): void {
            safe(() => {
              gen.update({ metadata: sanitizeAttributes(attrs) as Record<string, unknown> });
            }, undefined);
          },
        };
      } catch (err) {
        logExportError(err);
        return noopTracingAdapter.startGeneration(metadata);
      }
    },

    endTrace(summary: TurnFinalSummary): void {
      if (!_traceStarted) return;
      const requestId = _traceRequestId;
      _traceStarted = false;
      _traceRequestId = "";
      adapterRegistry.delete(requestId);

      void (async () => {
        const root = traceRoots.get(requestId);
        if (!root) return;
        traceRoots.delete(requestId);

        if (!(await ensureSdk())) return;

        safe(() => {
          root.update({
            output: {
              finalJsonParsed: summary.finalJsonParsed,
              turnCommitted: summary.turnCommitted,
              narrativeCharLen: summary.narrativeCharLen,
              optionsCount: summary.optionsCount,
              fallbackUsed: summary.fallbackUsed,
              degradedMode: summary.degradedMode,
            },
            metadata: {
              optionsQualityPass: String(summary.optionsQualityPass ?? "N/A"),
              validatorIssueCount: String(summary.validatorIssueCount),
              ...(summary.validatorIssueCodes ? { validatorIssueCodes: summary.validatorIssueCodes.join(",") } : {}),
              npcConsistencyIssueCount: String(summary.npcConsistencyIssueCount),
              ...(summary.epistemicGateSummary ? { epistemicGateSummary: summary.epistemicGateSummary } : {}),
              firstStatusMs: String(summary.firstStatusMs ?? "N/A"),
              firstVisibleTextMs: String(summary.firstVisibleTextMs ?? "N/A"),
              finalMs: String(summary.finalMs ?? "N/A"),
              maxInterChunkGapMs: String(summary.maxInterChunkGapMs ?? "N/A"),
            },
            level: "DEFAULT",
          });
          root.end();
        }, undefined);
      })();
    },

    addScore(_score: LangfuseScore): void {
      // Scores via uploadScores() in scores.ts — not through tracing adapter.
    },
  };
  return self;
}

// ----- Public API -----

/**
 * Create a tracing adapter and register it as the current adapter for this
 * async context (via AsyncLocalStorage). All downstream convenience functions
 * (startTurnTrace, startStageSpan, startGeneration, endTurnTrace, addTraceScore)
 * will use this adapter without needing it passed explicitly.
 *
 * Returns noopTracingAdapter if Langfuse is not configured.
 */
export function createTracingAdapter(): TracingAdapter {
  if (!isLangfuseReady()) return noopTracingAdapter;
  const adapter = createRealAdapter();
  // Register for deep async chains where AsyncLocalStorage context may be lost
  _lastAdapter = adapter;
  adapterStorage.enterWith(adapter);
  return adapter;
}

let _lastAdapter: TracingAdapter | null = null;

/**
 * Get the currently active tracing adapter.
 * Prefers AsyncLocalStorage. Falls back to requestId-based registry,
 * then to the last-registered adapter.
 */
export function getCurrentAdapter(requestId?: string): TracingAdapter {
  const adapter = adapterStorage.getStore();
  if (adapter) return adapter;
  if (requestId) {
    const regAdapter = adapterRegistry.get(requestId);
    if (regAdapter) return regAdapter;
  }
  if (_lastAdapter) return _lastAdapter;
  return noopTracingAdapter;
}

// Legacy alias
export { createTracingAdapter as getTracingAdapter };

/**
 * Convenience: start a trace for a /api/chat turn.
 * Uses the adapter registered for the current async context.
 */
export function startTurnTrace(metadata: TurnTraceMetadata): void {
  getCurrentAdapter().startTrace("versecraft.chat.turn", metadata);
}

/**
 * Convenience: start a stage span.
 * Uses the adapter registered for the current async context.
 */
export function startStageSpan(metadata: StageSpanMetadata): SpanHandle {
  return getCurrentAdapter().startSpan(metadata);
}

// ----- Content helpers -----

const MAX_CONTENT_CHARS = 10_000;

function safeContent(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  try {
    const s = typeof val === "string" ? val : JSON.stringify(val);
    if (s.length <= MAX_CONTENT_CHARS) return s;
    return s.slice(0, MAX_CONTENT_CHARS) + `\n...[truncated ${s.length - MAX_CONTENT_CHARS} chars]`;
  } catch {
    return undefined;
  }
}

/**
 * Convenience: start a generation (LLM call).
 * Directly uses @langfuse/tracing's startObservation.
 * Parent-child linking via OTel context propagation — no adapter dependency.
 */
export function startGeneration(metadata: GenerationMetadata): GenerationHandle {
  if (!_sdkLoaded || !_startObservation) {
    return noopTracingAdapter.startGeneration(metadata);
  }

  try {
    const gen = _startObservation(metadata.name, {
      model: metadata.gatewayModel,
      modelParameters: {
        provider: metadata.provider,
        intendedRole: metadata.intendedRole,
        actualRole: metadata.actualRole,
        attempt: String(metadata.attemptIndex),
        retry: String(metadata.retryCount),
        stream: String(metadata.stream),
      },
      input: safeContent(metadata.input),
      output: safeContent(metadata.output),
      usageDetails: {
        ...(metadata.promptTokens != null ? { input: metadata.promptTokens } : {}),
        ...(metadata.completionTokens != null ? { output: metadata.completionTokens } : {}),
        ...(metadata.totalTokens != null ? { total: metadata.totalTokens } : {}),
        ...(metadata.cachedPromptTokens != null ? { cachedInputTokens: metadata.cachedPromptTokens } : {}),
      },
      costDetails: metadata.estCostUsd != null ? { total: metadata.estCostUsd } : undefined,
      metadata: {
        provider: metadata.provider,
        httpStatus: String(metadata.httpStatus ?? "N/A"),
        finishReason: metadata.finishReason ?? "N/A",
        ttftMs: String(metadata.ttftMs ?? "N/A"),
        totalLatencyMs: String(metadata.totalLatencyMs ?? "N/A"),
        retryCount: String(metadata.retryCount),
        fallbackCount: String(metadata.fallbackCount),
        cacheHit: String(metadata.cacheHit),
        toolCallCount: String(metadata.toolCallCount ?? 0),
        jsonSanitized: String(metadata.jsonSanitized ?? false),
        errorCode: metadata.errorCode ?? "N/A",
        errorClass: metadata.errorClass ?? "N/A",
        stream: String(metadata.stream),
      },
      level: metadata.success ? "DEFAULT" : "ERROR",
      statusMessage: metadata.errorCode,
    }, { asType: "generation" });

    return {
      end(update?: Partial<GenerationMetadata>): void {
        safe(() => {
          if (update) {
            const updates: Record<string, unknown> = {};
            if (update.success !== undefined) updates.level = update.success ? "DEFAULT" : "ERROR";
            if (update.output !== undefined) updates.output = safeContent(update.output);
            if (update.finishReason !== undefined) {
              updates.metadata = { ...(updates.metadata as object || {}), finishReason: update.finishReason };
            }
            if (update.totalLatencyMs !== undefined) {
              updates.metadata = { ...(updates.metadata as object || {}), totalLatencyMs: String(update.totalLatencyMs) };
            }
            // Update usage if any token count is present (including 0)
            if (update.promptTokens != null || update.completionTokens != null || update.totalTokens != null) {
              updates.usageDetails = {
                ...(update.promptTokens != null ? { input: update.promptTokens } : {}),
                ...(update.completionTokens != null ? { output: update.completionTokens } : {}),
                ...(update.totalTokens != null ? { total: update.totalTokens } : {}),
              };
            }
            if (Object.keys(updates).length > 0) {
              gen.update(updates);
            }
          }
          gen.end();
        }, undefined);
      },
      setAttributes(attrs: Record<string, string | number | boolean>): void {
        safe(() => {
          gen.update({ metadata: sanitizeAttributes(attrs) as Record<string, unknown> });
        }, undefined);
      },
    };
  } catch (err) {
    logExportError(err);
    return noopTracingAdapter.startGeneration(metadata);
  }
}

/**
 * Convenience: finalize a turn trace.
 * Uses the adapter registered for the current async context.
 */
export function endTurnTrace(summary: TurnFinalSummary): void {
  getCurrentAdapter().endTrace(summary);
}

/**
 * Convenience: add a score.
 * Uses the adapter registered for the current async context.
 */
export function addTraceScore(score: LangfuseScore): void {
  getCurrentAdapter().addScore(score);
}

/**
 * Get the current Langfuse trace ID for the given request ID.
 * Returns undefined if no trace is active.
 */
export function getLangfuseTraceId(requestId: string): string | undefined {
  // HMR-safe: traceIdMap backed by globalThis survives Next.js dev reloads
  const tid = traceIdMap.get(requestId);
  if (tid) return tid;
  
  // Fallback: try root span via otelSpan
  const root = traceRoots.get(requestId);
  if (!root) return undefined;
  return safe(() => {
    const rawCtx = (root as any).otelSpan?.spanContext?.();
    return rawCtx?.traceId;
  }, undefined);
}

/**
 * Preload the Langfuse SDK so subsequent startObservation calls are synchronous.
 * Must be awaited early in request handlers.
 */
export async function ensureLangfuseSdk(): Promise<void> {
  await ensureSdk();
}

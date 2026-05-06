import type { AiProviderId, TokenUsage } from "@/lib/ai/types/core";

export interface ChatGenerationMetricInput {
  requestId: string;
  sessionId?: string | null;
  userId?: string | null;
  provider: AiProviderId | string;
  model: string | null;
  logicalRole: string | null;
  promptVersion?: string | null;
  promptStablePrefixHash?: string | null;
  scenarioOrTurnMode?: string | null;
  firstStatusMs?: number | null;
  firstVisibleTextMs?: number | null;
  finalMs?: number | null;
  maxInterChunkGapMs?: number | null;
  longGapCount?: number | null;
  finalJsonParseSuccess?: boolean | null;
  narrativeChars?: number | null;
  optionsCount?: number | null;
  optionsQualityPass?: boolean | null;
  optionsRepairUsed?: boolean | null;
  optionsRepairMs?: number | null;
  fallbackUsed?: boolean | null;
  degradedMode?: boolean | null;
  queueWaitMs?: number | null;
  preflightMs?: number | null;
  loreRetrievalMs?: number | null;
  promptBuildMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  retryCount?: number | null;
  errorType?: string | null;
  usage?: TokenUsage | null;
}

function hashIdentifier(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

export function buildChatGenerationMetrics(input: ChatGenerationMetricInput): Record<string, unknown> {
  const inputTokens = finiteNumber(input.inputTokens ?? input.usage?.promptTokens);
  const outputTokens = finiteNumber(input.outputTokens ?? input.usage?.completionTokens);
  const cachedInputTokens = finiteNumber(input.cachedInputTokens ?? input.usage?.cachedPromptTokens);
  const totalTokens = finiteNumber(input.usage?.totalTokens) ?? ((inputTokens ?? 0) + (outputTokens ?? 0) || null);
  const operationDuration = finiteNumber(input.finalMs);
  const timeToFirstToken = finiteNumber(input.firstVisibleTextMs);
  return {
    requestId: input.requestId,
    sessionIdHash: hashIdentifier(input.sessionId),
    userIdHash: hashIdentifier(input.userId),
    provider: input.provider,
    model: input.model,
    logicalRole: input.logicalRole,
    promptVersion: input.promptVersion ?? null,
    promptStablePrefixHash: input.promptStablePrefixHash ?? null,
    scenarioOrTurnMode: input.scenarioOrTurnMode ?? null,
    firstStatusMs: finiteNumber(input.firstStatusMs),
    firstVisibleTextMs: timeToFirstToken,
    finalMs: operationDuration,
    maxInterChunkGapMs: finiteNumber(input.maxInterChunkGapMs),
    longGapCount: finiteNumber(input.longGapCount),
    finalJsonParseSuccess: input.finalJsonParseSuccess ?? null,
    narrativeChars: finiteNumber(input.narrativeChars),
    optionsCount: finiteNumber(input.optionsCount),
    optionsQualityPass: input.optionsQualityPass ?? null,
    optionsRepairUsed: input.optionsRepairUsed ?? null,
    optionsRepairMs: finiteNumber(input.optionsRepairMs),
    fallbackUsed: input.fallbackUsed ?? null,
    degradedMode: input.degradedMode ?? null,
    queueWaitMs: finiteNumber(input.queueWaitMs),
    preflightMs: finiteNumber(input.preflightMs),
    loreRetrievalMs: finiteNumber(input.loreRetrievalMs),
    promptBuildMs: finiteNumber(input.promptBuildMs),
    inputTokens,
    outputTokens,
    cachedInputTokens,
    retryCount: finiteNumber(input.retryCount),
    errorType: input.errorType ?? null,
    "gen_ai.client.token.usage": {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      cached_input_tokens: cachedInputTokens,
    },
    "gen_ai.client.operation.duration": operationDuration,
    "gen_ai.server.time_to_first_token": timeToFirstToken,
  };
}

export function logChatGenerationMetrics(input: ChatGenerationMetricInput): void {
  try {
    console.info("[observability][chat_generation_metrics]", buildChatGenerationMetrics(input));
  } catch {
    // Metrics must never affect the realtime turn path.
  }
}

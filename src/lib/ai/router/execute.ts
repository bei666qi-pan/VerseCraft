// src/lib/ai/router/execute.ts
import "server-only";

import { resolveAiEnv } from "@/lib/ai/config/env";
import { recordProviderFailure, recordProviderSuccess, isCircuitOpen } from "@/lib/ai/fallback/circuitBreaker";
import type { AllowedModelId } from "@/lib/ai/models/registry";
import { ALLOWED_MODEL_IDS, getRegisteredModel } from "@/lib/ai/models/registry";
import { getProviderFactory } from "@/lib/ai/providers";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { resilientFetch } from "@/lib/ai/resilience/fetchWithRetry";
import { extractNonStreamContent } from "@/lib/ai/stream/openaiLike";
import { resolveFallbackPolicy, assertPlayerChatModelAllowed } from "@/lib/ai/tasks/routing";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import type { AIRequestContext, AiProviderId, ChatMessage, TaskType } from "@/lib/ai/types/core";
import type { AIResponse, AIErrorResponse } from "@/lib/ai/types";

function providerEndpoint(
  provider: AiProviderId
): { url: string; key: string } {
  const env = resolveAiEnv();
  if (provider === "deepseek") {
    return { url: env.deepseek.apiUrl, key: env.deepseek.apiKey };
  }
  if (provider === "zhipu") {
    return { url: env.zhipu.apiUrl, key: env.zhipu.apiKey };
  }
  return { url: env.minimax.apiUrl, key: env.minimax.apiKey };
}

function asAllowedModelId(id: string): AllowedModelId | null {
  return ALLOWED_MODEL_IDS.includes(id as AllowedModelId) ? (id as AllowedModelId) : null;
}

function streamUsageFlag(provider: AiProviderId): boolean {
  // Zhipu: keep off by default to avoid vendor rejects; DeepSeek + MiniMax support usage in stream.
  return provider === "deepseek" || provider === "minimax";
}

function buildPlayerStreamBody(modelId: AllowedModelId, messages: ChatMessage[]): NormalizedCompletionRequest {
  const reg = getRegisteredModel(modelId);
  return {
    modelApiName: reg.apiModel,
    messages,
    stream: true,
    maxTokens: 1536,
    responseFormatJsonObject: reg.provider !== "minimax",
    streamIncludeUsage: streamUsageFlag(reg.provider),
  };
}

function buildNonStreamBody(
  modelId: AllowedModelId,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number | undefined,
  jsonObject: boolean
): NormalizedCompletionRequest {
  const reg = getRegisteredModel(modelId);
  return {
    modelApiName: reg.apiModel,
    messages,
    stream: false,
    maxTokens,
    temperature,
    responseFormatJsonObject: jsonObject && reg.provider !== "minimax",
    streamIncludeUsage: false,
  };
}

export type PlayerChatStreamSuccess = {
  ok: true;
  response: Response;
  modelId: AllowedModelId;
  providerId: AiProviderId;
};

export type PlayerChatStreamFailure = {
  ok: false;
  code: "NO_CREDENTIALS" | "CHAIN_EXHAUSTED" | "ABORTED";
  message: string;
  /** Populated for HTTP failures from last attempted upstream. */
  lastHttpStatus?: number;
};

export type PlayerChatStreamResult = PlayerChatStreamSuccess | PlayerChatStreamFailure;

/**
 * Player-facing SSE chat: tries fallback chain with timeout/retry/circuit + telemetry.
 * Never uses offline-only models (e.g. deepseek-reasoner) — enforced in routing + runtime assert.
 */
export async function executePlayerChatStream(params: {
  messages: ChatMessage[];
  ctx: AIRequestContext;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<PlayerChatStreamResult> {
  const env = resolveAiEnv();
  const policy = resolveFallbackPolicy("player_chat_stream");
  const timeoutMs = params.timeoutMs ?? env.defaultTimeoutMs;
  const maxRetries = env.maxRetries;

  if (policy.chain.length === 0) {
    return {
      ok: false,
      code: "NO_CREDENTIALS",
      message: "未配置任何可用的大模型 API Key（玩家链路需要至少一个厂商密钥）。",
    };
  }

  let lastHttpStatus: number | undefined;

  for (const mid of policy.chain) {
    const modelId = asAllowedModelId(mid);
    if (!modelId) continue;
    assertPlayerChatModelAllowed(modelId);
    const reg = getRegisteredModel(modelId);

    if (policy.tripCircuitOnFailure && isCircuitOpen(reg.provider)) {
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "circuit_skip",
      });
      continue;
    }

    const { url, key } = providerEndpoint(reg.provider);
    if (!key) {
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "fallback",
        message: "missing_api_key",
      });
      continue;
    }

    const factory = getProviderFactory(reg.provider);
    const body = buildPlayerStreamBody(modelId, params.messages);
    const init = factory.buildInit(key, body);
    const t0 = Date.now();

    logAiTelemetry({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId: reg.provider,
      modelId,
      phase: "start",
      attempt: 0,
    });

    try {
      if (params.signal?.aborted) {
        return { ok: false, code: "ABORTED", message: "请求已取消。" };
      }

      const res = await resilientFetch(url, init, {
        timeoutMs,
        maxRetries,
        parentSignal: params.signal,
      });
      lastHttpStatus = res.status;

      if (res.ok && res.body) {
        recordProviderSuccess(reg.provider);
        logAiTelemetry({
          requestId: params.ctx.requestId,
          task: params.ctx.task,
          providerId: reg.provider,
          modelId,
          phase: "success",
          latencyMs: Date.now() - t0,
          httpStatus: res.status,
        });
        return { ok: true, response: res, modelId, providerId: reg.provider };
      }

      if (policy.tripCircuitOnFailure) {
        recordProviderFailure(reg.provider);
      }
      const errText = await res.text().catch(() => "");
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "error",
        latencyMs: Date.now() - t0,
        httpStatus: res.status,
        message: errText.slice(0, 500),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        logAiTelemetry({
          requestId: params.ctx.requestId,
          task: params.ctx.task,
          providerId: reg.provider,
          modelId,
          phase: "error",
          latencyMs: Date.now() - t0,
          message: "aborted",
        });
        return { ok: false, code: "ABORTED", message: "请求超时或已被取消。" };
      }
      if (policy.tripCircuitOnFailure) {
        recordProviderFailure(reg.provider);
      }
      const msg = e instanceof Error ? e.message : String(e);
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "error",
        latencyMs: Date.now() - t0,
        message: msg,
      });
    }
  }

  return {
    ok: false,
    code: "CHAIN_EXHAUSTED",
    message: "所有候选模型均调用失败，请稍后重试或检查密钥与配额。",
    lastHttpStatus,
  };
}

export async function executeChatCompletion(params: {
  task: TaskType;
  messages: ChatMessage[];
  ctx: AIRequestContext;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens: number;
  temperature?: number;
  responseFormatJsonObject?: boolean;
}): Promise<AIResponse | AIErrorResponse> {
  const env = resolveAiEnv();
  const policy = resolveFallbackPolicy(params.task);
  const timeoutMs = params.timeoutMs ?? (params.task === "memory_compression" ? 30_000 : env.defaultTimeoutMs);
  const maxRetries = env.maxRetries;
  const jsonObject = params.responseFormatJsonObject ?? true;

  if (policy.chain.length === 0) {
    return {
      ok: false,
      code: "NO_CREDENTIALS",
      message: "No AI provider API keys configured for this task.",
    };
  }

  for (const mid of policy.chain) {
    const modelId = asAllowedModelId(mid);
    if (!modelId) continue;
    const reg = getRegisteredModel(modelId);

    if (policy.tripCircuitOnFailure && isCircuitOpen(reg.provider)) {
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "circuit_skip",
      });
      continue;
    }

    const { url, key } = providerEndpoint(reg.provider);
    if (!key) {
      continue;
    }

    const factory = getProviderFactory(reg.provider);
    const body = buildNonStreamBody(
      modelId,
      params.messages,
      params.maxTokens,
      params.temperature,
      jsonObject
    );
    const init = factory.buildInit(key, body);
    const t0 = Date.now();

    logAiTelemetry({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId: reg.provider,
      modelId,
      phase: "start",
    });

    try {
      const res = await resilientFetch(url, init, {
        timeoutMs,
        maxRetries,
        parentSignal: params.signal,
      });

      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const { content, usage } = extractNonStreamContent(raw);
        recordProviderSuccess(reg.provider);
        logAiTelemetry({
          requestId: params.ctx.requestId,
          task: params.ctx.task,
          providerId: reg.provider,
          modelId,
          phase: "success",
          latencyMs: Date.now() - t0,
          httpStatus: res.status,
          usage,
        });
        return {
          ok: true,
          providerId: reg.provider,
          modelId,
          content,
          usage,
          latencyMs: Date.now() - t0,
        };
      }

      if (policy.tripCircuitOnFailure) {
        recordProviderFailure(reg.provider);
      }
      const errText = await res.text().catch(() => "");
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "error",
        latencyMs: Date.now() - t0,
        httpStatus: res.status,
        message: errText.slice(0, 300),
      });
    } catch (e) {
      if (policy.tripCircuitOnFailure) {
        recordProviderFailure(reg.provider);
      }
      const msg = e instanceof Error ? e.message : String(e);
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: reg.provider,
        modelId,
        phase: "error",
        latencyMs: Date.now() - t0,
        message: msg,
      });
    }
  }

  return {
    ok: false,
    code: "CHAIN_EXHAUSTED",
    message: "All models in fallback chain failed.",
  };
}

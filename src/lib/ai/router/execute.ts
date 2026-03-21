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
import {
  assertModelAllowedForTask,
  getTaskBinding,
  resolveFallbackPolicy,
  type TaskBinding,
} from "@/lib/ai/tasks/taskPolicy";
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

function buildPlayerStreamBody(
  modelId: AllowedModelId,
  messages: ChatMessage[],
  binding: TaskBinding
): NormalizedCompletionRequest {
  const reg = getRegisteredModel(modelId);
  return {
    modelApiName: reg.apiModel,
    messages,
    stream: binding.stream,
    maxTokens: binding.maxTokens,
    temperature: binding.temperature,
    responseFormatJsonObject: binding.responseFormatJsonObject && reg.provider !== "minimax",
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
  if (params.ctx.task !== "PLAYER_CHAT") {
    console.warn(
      `[ai] executePlayerChatStream: ctx.task should be PLAYER_CHAT (got ${params.ctx.task}); telemetry may be misleading.`
    );
  }
  const env = resolveAiEnv();
  const taskBinding = getTaskBinding("PLAYER_CHAT");
  const policy = resolveFallbackPolicy("PLAYER_CHAT");
  const timeoutMs = params.timeoutMs ?? taskBinding.timeoutMs;
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
    assertModelAllowedForTask("PLAYER_CHAT", modelId);
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
    const body = buildPlayerStreamBody(modelId, params.messages, taskBinding);
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
  /** Per-call timeout (e.g. memory compress); does not log as dev override. */
  requestTimeoutMs?: number;
  /** Escape hatch for experiments; avoid in production paths. */
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  if (params.task === "PLAYER_CHAT") {
    throw new Error("[ai] PLAYER_CHAT must use executePlayerChatStream(), not executeChatCompletion()");
  }
  const env = resolveAiEnv();
  const baseBinding = getTaskBinding(params.task);
  const policy = resolveFallbackPolicy(params.task);
  if (params.devOverrides && Object.keys(params.devOverrides).length > 0) {
    console.warn(`[ai] devOverrides applied for task=${params.task}`, params.devOverrides);
  }
  const binding: TaskBinding = {
    ...baseBinding,
    ...params.devOverrides,
    timeoutMs:
      params.requestTimeoutMs ??
      params.devOverrides?.timeoutMs ??
      baseBinding.timeoutMs,
  };
  const timeoutMs = binding.timeoutMs;
  const maxRetries = env.maxRetries;
  const jsonObject = binding.responseFormatJsonObject;

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
      binding.maxTokens,
      binding.temperature,
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

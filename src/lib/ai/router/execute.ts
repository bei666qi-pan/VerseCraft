// src/lib/ai/router/execute.ts
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import { resolveOperationMode, type OperationMode } from "@/lib/ai/degrade/modeCore";
import {
  classifyFetchThrowable,
  classifyHttpStatus,
  shouldAdvanceToNextModel,
  shouldCountTowardCircuit,
  shouldCountTowardProviderCircuit,
} from "@/lib/ai/errors/classify";
import { isCircuitOpen } from "@/lib/ai/fallback/circuitBreaker";
import { isModelCircuitOpen, recordModelFailure, recordModelSuccess } from "@/lib/ai/fallback/modelCircuit";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { getProviderFactory } from "@/lib/ai/providers";
import type { NormalizedCompletionRequest } from "@/lib/ai/providers/types";
import { resilientFetch } from "@/lib/ai/resilience/fetchWithRetry";
import { extractNonStreamContent } from "@/lib/ai/stream/openaiLike";
import {
  assertModelAllowedForTask,
  getTaskBinding,
  resolveFallbackPolicy,
  resolveOrderedRoleChain,
  type TaskBinding,
} from "@/lib/ai/tasks/taskPolicy";
import { estimateUsdForUsage } from "@/lib/ai/governance/costModel";
import {
  completionCacheTtlSec,
  isCompletionTaskCacheable,
  readCompletionCache,
  writeCompletionCache,
} from "@/lib/ai/governance/responseCache";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import type { AIRequestContext, AiProviderId, ChatMessage, TaskType } from "@/lib/ai/types/core";
import type { AiRoutingAttempt, AiRoutingReport } from "@/lib/ai/routing/types";
import type { AIResponse, AIErrorResponse } from "@/lib/ai/types";
import { isValidJsonObjectString } from "@/lib/ai/validation/structuredOutput";

const PROVIDER_ID = "oneapi" as const satisfies AiProviderId;

function isOfflineTask(task: TaskType): boolean {
  return task === "WORLDBUILD_OFFLINE" || task === "STORYLINE_SIMULATION" || task === "DEV_ASSIST";
}

function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function extractFirstJsonObject(text: string): string | null {
  const s = text.trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1).trim();
    }
  }
  return null;
}

function sanitizeReasonerJsonText(text: string): { content: string; sanitized: boolean } {
  const noThink = stripThinkBlocks(text);
  if (isValidJsonObjectString(noThink)) return { content: noThink, sanitized: noThink !== text.trim() };
  const extracted = extractFirstJsonObject(noThink);
  if (extracted && isValidJsonObjectString(extracted)) {
    return { content: extracted, sanitized: true };
  }
  return { content: noThink, sanitized: noThink !== text.trim() };
}

function gatewayEndpoint(env: ReturnType<typeof resolveAiEnv>): { url: string; key: string } {
  return { url: env.gatewayBaseUrl, key: env.gatewayApiKey };
}

function buildPlayerStreamBody(
  gatewayModel: string,
  messages: ChatMessage[],
  binding: TaskBinding,
  enableStream: boolean,
  extraBody?: Record<string, unknown>
): NormalizedCompletionRequest {
  const stream = binding.stream && enableStream;
  return {
    modelApiName: gatewayModel,
    messages,
    stream,
    maxTokens: binding.maxTokens,
    temperature: binding.temperature,
    responseFormatJsonObject: binding.responseFormatJsonObject,
    streamIncludeUsage: stream,
    ...(extraBody && Object.keys(extraBody).length > 0 ? { extraBody } : {}),
  };
}

function buildNonStreamBody(
  gatewayModel: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number | undefined,
  jsonObject: boolean
): NormalizedCompletionRequest {
  return {
    modelApiName: gatewayModel,
    messages,
    stream: false,
    maxTokens,
    temperature,
    responseFormatJsonObject: jsonObject,
    streamIncludeUsage: false,
  };
}

function countFallbacks(attempts: AiRoutingAttempt[]): number {
  return attempts.filter((a) => a.failureKind !== undefined).length;
}

export type PlayerChatStreamSuccess = {
  ok: true;
  response: Response;
  logicalRole: AiLogicalRole;
  providerId: AiProviderId;
  intendedLogicalRole: AiLogicalRole;
  gatewayModel: string;
  operationMode: OperationMode;
  httpAttempts: AiRoutingAttempt[];
};

export type PlayerChatStreamFailure = {
  ok: false;
  code: "NO_CREDENTIALS" | "CHAIN_EXHAUSTED" | "ABORTED";
  message: string;
  lastHttpStatus?: number;
  intendedLogicalRole?: AiLogicalRole;
  operationMode?: OperationMode;
  httpAttempts?: AiRoutingAttempt[];
};

export type PlayerChatStreamResult = PlayerChatStreamSuccess | PlayerChatStreamFailure;

/**
 * Player-facing SSE: ordered role chain, circuits, classified failures.
 * Use `skipRoles` for stream-layer retries without re-hitting the same role.
 */
export async function executePlayerChatStream(params: {
  messages: ChatMessage[];
  ctx: AIRequestContext;
  signal?: AbortSignal;
  timeoutMs?: number;
  skipRoles?: readonly AiLogicalRole[];
}): Promise<PlayerChatStreamResult> {
  if (params.ctx.task !== "PLAYER_CHAT") {
    console.warn(
      `[ai] executePlayerChatStream: ctx.task should be PLAYER_CHAT (got ${params.ctx.task}); telemetry may be misleading.`
    );
  }
  const env = resolveAiEnv();
  const mode = resolveOperationMode();
  const taskBinding = getTaskBinding("PLAYER_CHAT");
  const policy = resolveFallbackPolicy("PLAYER_CHAT", env, mode);
  const timeoutMs = params.timeoutMs ?? taskBinding.timeoutMs;
  const maxRetries = env.maxRetries;
  const skip = new Set(params.skipRoles ?? []);
  const fullChain = resolveOrderedRoleChain("PLAYER_CHAT", env, mode);
  const intendedLogicalRole = fullChain[0] ?? ("main" as AiLogicalRole);
  const attempts: AiRoutingAttempt[] = [];

  if (policy.chain.length === 0) {
    return {
      ok: false,
      code: "NO_CREDENTIALS",
      message: "未配置可用的 AI 网关或主模型（需要 AI_GATEWAY_BASE_URL、AI_GATEWAY_API_KEY、AI_MODEL_MAIN）。",
      intendedLogicalRole,
      operationMode: mode,
      httpAttempts: attempts,
    };
  }

  let lastHttpStatus: number | undefined;
  const { url, key } = gatewayEndpoint(env);

  for (const role of policy.chain) {
    if (skip.has(role)) continue;

    assertModelAllowedForTask("PLAYER_CHAT", role);
    const gatewayModel = env.modelsByRole[role];
    if (!gatewayModel) continue;

    if (policy.tripCircuitOnFailure && (isCircuitOpen(PROVIDER_ID) || isModelCircuitOpen(role))) {
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: "CIRCUIT_SKIP",
        severity: "soft",
        message: "provider_or_model_circuit_open",
      });
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: PROVIDER_ID,
        logicalRole: role,
        gatewayModel,
        phase: "circuit_skip",
        errorCode: "CIRCUIT_SKIP",
      });
      continue;
    }

    if (!key) {
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: "UNKNOWN",
        severity: "soft",
        message: "missing_api_key",
      });
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: PROVIDER_ID,
        logicalRole: role,
        gatewayModel,
        phase: "fallback",
        message: "missing_api_key",
      });
      continue;
    }

    const factory = getProviderFactory();
    const body = buildPlayerStreamBody(
      gatewayModel,
      params.messages,
      taskBinding,
      env.enableStream,
      env.gatewayExtraBody
    );
    const init = factory.buildInit(key, body);
    const t0 = Date.now();

    logAiTelemetry({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId: PROVIDER_ID,
      logicalRole: role,
      gatewayModel,
      phase: "start",
      attempt: 0,
      stream: true,
      userId: params.ctx.userId,
    });

    try {
      let retryCount = 0;
      if (params.signal?.aborted) {
        return {
          ok: false,
          code: "ABORTED",
          message: "请求已取消。",
          intendedLogicalRole,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }

      const res = await resilientFetch(url, init, {
        timeoutMs,
        maxRetries,
        parentSignal: params.signal,
        onRetry: () => {
          retryCount += 1;
        },
      });
      lastHttpStatus = res.status;

      if (res.ok && res.body) {
        recordModelSuccess(role, PROVIDER_ID);
        attempts.push({
          logicalRole: role,
          providerId: PROVIDER_ID,
          gatewayModel,
          phase: "http",
          latencyMs: Date.now() - t0,
        });
        logAiTelemetry({
          requestId: params.ctx.requestId,
          task: params.ctx.task,
          providerId: PROVIDER_ID,
          logicalRole: role,
          gatewayModel,
          phase: "success",
          latencyMs: Date.now() - t0,
          httpStatus: res.status,
          stream: true,
          fallbackCount: countFallbacks(attempts),
          retryCount,
          failureScope: "online",
          userId: params.ctx.userId,
        });
        return {
          ok: true,
          response: res,
          logicalRole: role,
          providerId: PROVIDER_ID,
          intendedLogicalRole,
          gatewayModel,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }

      const { kind, severity } = classifyHttpStatus(res.status);
      const errText = await res.text().catch(() => "");
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: kind,
        severity,
        httpStatus: res.status,
        message: errText.slice(0, 400),
        latencyMs: Date.now() - t0,
      });
      if (policy.tripCircuitOnFailure && shouldCountTowardCircuit(kind)) {
        recordModelFailure(role, PROVIDER_ID, { providerScope: "online", countProvider: true });
      }
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: PROVIDER_ID,
        logicalRole: role,
        gatewayModel,
        phase: "error",
        latencyMs: Date.now() - t0,
        httpStatus: res.status,
        errorCode: kind,
        message: errText.slice(0, 500),
        stream: true,
        fallbackCount: countFallbacks(attempts),
        retryCount,
        failureScope: "online",
        userId: params.ctx.userId,
      });
    } catch (e) {
      const { kind, severity } = classifyFetchThrowable(e);
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: kind,
        severity,
        message: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - t0,
      });
      if (kind === "ABORTED" || !shouldAdvanceToNextModel(kind)) {
        return {
          ok: false,
          code: "ABORTED",
          message: "请求超时或已被取消。",
          lastHttpStatus,
          intendedLogicalRole,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }
      if (policy.tripCircuitOnFailure && shouldCountTowardCircuit(kind)) {
        recordModelFailure(role, PROVIDER_ID, { providerScope: "online", countProvider: true });
      }
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: PROVIDER_ID,
        logicalRole: role,
        gatewayModel,
        phase: "error",
        latencyMs: Date.now() - t0,
        errorCode: kind,
        message: e instanceof Error ? e.message : String(e),
        stream: true,
        fallbackCount: countFallbacks(attempts),
        failureScope: "online",
        userId: params.ctx.userId,
      });
    }
  }

  return {
    ok: false,
    code: "CHAIN_EXHAUSTED",
    message: "所有候选逻辑角色均调用失败，请稍后重试或检查网关与模型配置。",
    lastHttpStatus,
    intendedLogicalRole,
    operationMode: mode,
    httpAttempts: attempts,
  };
}

export async function executeChatCompletion(params: {
  task: TaskType;
  messages: ChatMessage[];
  ctx: AIRequestContext;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  /** When true, skip offline response cache (DEV_ASSIST / worldbuild / storyline). */
  skipCache?: boolean;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  if (params.task === "PLAYER_CHAT") {
    throw new Error("[ai] PLAYER_CHAT must use executePlayerChatStream(), not executeChatCompletion()");
  }
  const env = resolveAiEnv();
  const mode = resolveOperationMode();
  const baseBinding = getTaskBinding(params.task);
  const policy = resolveFallbackPolicy(params.task, env, mode);
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
  const failureScope = isOfflineTask(params.task) ? "offline" : "online";
  const fullChain = resolveOrderedRoleChain(params.task, env, mode);
  const intendedLogicalRole = fullChain[0] ?? ("main" as AiLogicalRole);
  const attempts: AiRoutingAttempt[] = [];

  if (policy.chain.length === 0) {
    return {
      ok: false,
      code: "NO_CREDENTIALS",
      message: "No AI gateway or role models configured for this task.",
      routing: {
        requestId: params.ctx.requestId,
        task: params.task,
        operationMode: mode,
        intendedRole: intendedLogicalRole,
        actualLogicalRole: null,
        fallbackCount: 0,
        attempts,
        finalStatus: "upstream_exhausted",
        lastFailureSummary: "no_credentials",
      },
    };
  }

  if (params.skipCache !== true && isCompletionTaskCacheable(params.task)) {
    const cached = await readCompletionCache(params.task, params.messages);
    if (cached) {
      const est = estimateUsdForUsage(cached.logicalRole, cached.usage);
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: cached.providerId,
        logicalRole: cached.logicalRole,
        gatewayModel: cached.gatewayModel,
        phase: "success",
        latencyMs: 0,
        usage: cached.usage,
        stream: false,
        cacheHit: true,
        fallbackCount: 0,
        estCostUsd: est,
        userId: params.ctx.userId,
      });
      return {
        ok: true,
        providerId: cached.providerId,
        logicalRole: cached.logicalRole,
        content: cached.content,
        usage: cached.usage,
        latencyMs: 0,
        fromCache: true,
        routing: {
          requestId: params.ctx.requestId,
          task: params.task,
          operationMode: mode,
          intendedRole: intendedLogicalRole,
          actualLogicalRole: cached.logicalRole,
          fallbackCount: 0,
          attempts: [],
          finalStatus: "success",
        },
      };
    }
  }

  const { url, key } = gatewayEndpoint(env);

  for (const role of policy.chain) {
    const gatewayModel = env.modelsByRole[role];
    if (!gatewayModel) continue;

    if (policy.tripCircuitOnFailure && (isCircuitOpen(PROVIDER_ID) || isModelCircuitOpen(role))) {
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: "CIRCUIT_SKIP",
        severity: "soft",
        message: "circuit_open",
      });
      continue;
    }

    if (!key) {
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: "UNKNOWN",
        severity: "soft",
        message: "missing_api_key",
      });
      continue;
    }

    const factory = getProviderFactory();
    const body = buildNonStreamBody(
      gatewayModel,
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
      providerId: PROVIDER_ID,
      logicalRole: role,
      gatewayModel,
      phase: "start",
      stream: false,
      userId: params.ctx.userId,
    });

    try {
      let retryCount = 0;
      const res = await resilientFetch(url, init, {
        timeoutMs,
        maxRetries,
        parentSignal: params.signal,
        onRetry: () => {
          retryCount += 1;
        },
      });

      if (!res.ok) {
        const { kind, severity } = classifyHttpStatus(res.status);
        const errText = await res.text().catch(() => "");
        attempts.push({
          logicalRole: role,
          providerId: PROVIDER_ID,
          gatewayModel,
          phase: "http",
          failureKind: kind,
          severity,
          httpStatus: res.status,
          message: errText.slice(0, 300),
          latencyMs: Date.now() - t0,
        });
        if (policy.tripCircuitOnFailure && shouldCountTowardCircuit(kind)) {
          const countProvider = shouldCountTowardProviderCircuit(
            kind,
            failureScope,
            env.offlineAffectsProviderCircuit
          );
          recordModelFailure(role, PROVIDER_ID, {
            providerScope: failureScope,
            countProvider,
          });
        }
        continue;
      }

      const raw = (await res.json()) as unknown;
      const { content, usage } = extractNonStreamContent(raw);
      const trimmed = (content ?? "").trim();

      if (!trimmed) {
        attempts.push({
          logicalRole: role,
          providerId: PROVIDER_ID,
          gatewayModel,
          phase: "http",
          failureKind: "EMPTY_CONTENT",
          severity: "soft",
          message: "empty_message_content",
          latencyMs: Date.now() - t0,
        });
        continue;
      }

      let processed = trimmed;
      let jsonSanitized = false;
      if (jsonObject && isOfflineTask(params.task)) {
        const s = sanitizeReasonerJsonText(trimmed);
        processed = s.content;
        jsonSanitized = s.sanitized;
      }

      if (jsonObject && !isValidJsonObjectString(processed)) {
        attempts.push({
          logicalRole: role,
          providerId: PROVIDER_ID,
          gatewayModel,
          phase: "http",
          failureKind: "JSON_PARSE",
          severity: "soft",
          message: "invalid_json_object",
          latencyMs: Date.now() - t0,
        });
        continue;
      }

      recordModelSuccess(role, PROVIDER_ID, { providerScope: failureScope });
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        latencyMs: Date.now() - t0,
      });

      const routing: AiRoutingReport = {
        requestId: params.ctx.requestId,
        task: params.task,
        operationMode: mode,
        intendedRole: intendedLogicalRole,
        actualLogicalRole: role,
        fallbackCount: countFallbacks(attempts),
        attempts,
        finalStatus: "success",
      };

      const estOk = estimateUsdForUsage(role, usage);
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId: PROVIDER_ID,
        logicalRole: role,
        gatewayModel,
        phase: "success",
        latencyMs: Date.now() - t0,
        httpStatus: res.status,
        usage,
        stream: false,
        cacheHit: false,
        fallbackCount: countFallbacks(attempts),
        retryCount,
        failureScope,
        jsonSanitized,
        estCostUsd: estOk,
        userId: params.ctx.userId,
      });

      if (params.skipCache !== true && isCompletionTaskCacheable(params.task)) {
        const ttl = completionCacheTtlSec(params.task);
        void writeCompletionCache(
          params.task,
          params.messages,
          {
            content: processed,
            logicalRole: role,
            gatewayModel,
            providerId: PROVIDER_ID,
            usage,
          },
          ttl
        ).catch(() => {});
      }

      return {
        ok: true,
        providerId: PROVIDER_ID,
        logicalRole: role,
        content: processed,
        usage,
        latencyMs: Date.now() - t0,
        routing,
      };
    } catch (e) {
      const { kind, severity } = classifyFetchThrowable(e);
      attempts.push({
        logicalRole: role,
        providerId: PROVIDER_ID,
        gatewayModel,
        phase: "http",
        failureKind: kind,
        severity,
        message: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - t0,
      });
      if (policy.tripCircuitOnFailure && shouldCountTowardCircuit(kind)) {
        const countProvider = shouldCountTowardProviderCircuit(
          kind,
          failureScope,
          env.offlineAffectsProviderCircuit
        );
        recordModelFailure(role, PROVIDER_ID, {
          providerScope: failureScope,
          countProvider,
        });
      }
    }
  }

  const lastFail = [...attempts].reverse().find((a) => a.failureKind);
  return {
    ok: false,
    code: "CHAIN_EXHAUSTED",
    message: "All roles in fallback chain failed.",
    routing: {
      requestId: params.ctx.requestId,
      task: params.task,
      operationMode: mode,
      intendedRole: intendedLogicalRole,
      actualLogicalRole: null,
      fallbackCount: countFallbacks(attempts),
      attempts,
      finalStatus: "upstream_exhausted",
      lastFailureSummary: lastFail
        ? `${lastFail.failureKind ?? "unknown"}:${lastFail.logicalRole}`
        : "unknown",
    },
  };
}

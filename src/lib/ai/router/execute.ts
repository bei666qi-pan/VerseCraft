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
import { responsesToChatCompletionsTransform } from "@/lib/ai/stream/responsesLike";
import { completionEndpoint } from "@/lib/ai/managed/urlSafety";
import { envBoolean } from "@/lib/config/envRaw";
import { buildPlayerNarrativeJsonToolRequest } from "@/lib/ai/schemas/playerDmJsonSchema";
import { resilientFetch, forceHttp1ForGateway } from "@/lib/ai/resilience/fetchWithRetry";
import { extractNonStreamContent } from "@/lib/ai/stream/openaiLike";
import { extractResponsesNonStreamContent, nonStreamResponsesToChatCompletionsStream } from "@/lib/ai/stream/responsesLike";
import {
  assertModelAllowedForTask,
  assertToolUseAllowedForTask,
  getTaskBinding,
  resolveFallbackPolicy,
  type TaskBinding,
} from "@/lib/ai/tasks/taskPolicy";
import {
  executeMockChatCompletion,
  executeMockPlayerChatStream,
  isMockAiProviderEnabled,
} from "@/lib/ai/mock/mockProvider";
import {
  completionCacheTtlSec,
  isCompletionTaskCacheable,
  readCompletionCache,
  writeCompletionCache,
} from "@/lib/ai/governance/responseCache";
import { logAiTelemetry } from "@/lib/ai/telemetry/log";
import type {
  AIRequestContext,
  AiProviderId,
  ChatMessage,
  TaskType,
  ToolChoiceOption,
  ToolDefinition,
} from "@/lib/ai/types/core";
import type { AiRoutingAttempt, AiRoutingReport } from "@/lib/ai/routing/types";
import type { AIResponse, AIErrorResponse } from "@/lib/ai/types";
import { isValidJsonObjectString, repairJsonObjectString } from "@/lib/ai/validation/structuredOutput";
import { buildPlayerDmJsonSchemaRequest, buildPlayerDmJsonToolRequest } from "@/lib/ai/schemas/playerDmJsonSchema";
import type { AiCostRecord } from "@/lib/ai/telemetry/log";
import { getManagedAiSnapshot, getManagedBindingsForTask } from "@/lib/ai/managed/state";
import type { ManagedAiBinding } from "@/lib/ai/managed/types";
import { buildManagedUsageRecord, enqueueManagedUsage } from "@/lib/ai/managed/usage";

async function ensureManagedAiSnapshot(): Promise<void> {
  if (getManagedAiSnapshot().ready) return;
  // The runtime owns DB/Redis-backed server state. Keep it out of the module
  // graph for deterministic mock/unit paths and load it only for live routing.
  const runtime = await import("@/lib/ai/managed/runtime");
  await runtime.ensureManagedAiSnapshot();
}

/**
 * Lazy-load Langfuse generation instrumentation.
 * Uses dynamic import to avoid pulling server-only / @langfuse/* into test/CI contexts.
 * Failures are silently ignored — Langfuse observability is best-effort.
 */
function recordGeneration(rec: AiCostRecord): void {
  void (async () => {
    try {
      const { recordAiGenerationMetric } = await import(
        "@/lib/observability/langfuse/generation"
      );
      recordAiGenerationMetric(rec);
    } catch {
      // Fail-open: Langfuse errors never propagate
    }
  })();
}

const MOCK_SCENARIO_RE = /\[mock_scenario:([a-z0-9_]+)\]/i;

/**
 * 从 messages 中检测 [mock_scenario:...] 标记。
 * 该标记由 benchmark/eval 的 --mode mock 模式注入。
 */
function hasMockScenarioMarker(messages: ChatMessage[]): boolean {
  for (const msg of messages) {
    if (typeof msg.content === "string" && MOCK_SCENARIO_RE.test(msg.content)) {
      return true;
    }
  }
  return false;
}

const PROVIDER_ID = "openai_compatible" as const satisfies AiProviderId;

function isOfflineTask(task: TaskType): boolean {
  return (
    task === "WORLDBUILD_OFFLINE" ||
    task === "STORYLINE_SIMULATION" ||
    task === "DEV_ASSIST" ||
    task === "EVAL_JUDGE"
  );
}

const PLAYER_GAMEPLAY_TASKS = new Set<TaskType>([
  "PLAYER_CHAT",
  "PLAYER_CONTROL_PREFLIGHT",
  "INTENT_PARSE",
  "SAFETY_PREFILTER",
  "RULE_RESOLUTION",
  "COMBAT_NARRATION",
  "GAMEPLAY_LOCALIZATION",
  "MECHANICS",
]);

function mergeExtraBody(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const merged = { ...(base ?? {}), ...(override ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
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
  // 离线 reasoner（思考类模型）在强制 JSON 时仍可能残留尾逗号 / 注释 / 单引号等可修复瑕疵。
  // 仅在上面严格校验已失败、内容本会被判 JSON_PARSE 丢弃时，用 jsonrepair 做最后兜底，
  // 避免 world director 等离线 tick 因小瑕疵整轮失败、agenda 永不落地。在线路径不经过此分支。
  const repaired = repairJsonObjectString(extracted ?? noThink);
  if (repaired) return { content: repaired, sanitized: true };
  return { content: noThink, sanitized: noThink !== text.trim() };
}

/**
 * Lightweight sanitization for ONLINE short JSON tasks (control-plane style).
 * Conservative by design: only strips <think> blocks and extracts the first JSON object.
 * Avoid applying heavy offline-reasoner heuristics to prevent unintended side effects.
 */
function sanitizeOnlineShortJsonText(text: string): { content: string; sanitized: boolean } {
  const trimmed = (text ?? "").trim();
  const noThink = stripThinkBlocks(trimmed);
  if (isValidJsonObjectString(noThink)) return { content: noThink, sanitized: noThink !== trimmed };
  const extracted = extractFirstJsonObject(noThink);
  if (extracted && isValidJsonObjectString(extracted)) return { content: extracted, sanitized: true };
  return { content: noThink, sanitized: noThink !== trimmed };
}

const ONLINE_SHORT_JSON_TASKS = new Set<TaskType>([
  "PLAYER_CONTROL_PREFLIGHT",
  "INTENT_PARSE",
  "SAFETY_PREFILTER",
]);

// EVAL_JUDGE is offline and deliberately keeps its own larger timeout/retry
// policy, but it consumes a machine-parsed verdict just like short control
// tasks. Keep transport cleanup separate from online fail-fast routing.
const STRICT_JSON_TRANSPORT_TASKS = new Set<TaskType>([
  ...ONLINE_SHORT_JSON_TASKS,
  "EVAL_JUDGE",
]);

const ONLINE_FAIL_FAST_JSON_TASKS = new Set<TaskType>(ONLINE_SHORT_JSON_TASKS);

function buildPlayerStreamBody(
  gatewayModel: string,
  messages: ChatMessage[],
  binding: TaskBinding,
  enableStream: boolean,
  streamIncludeUsage: boolean,
  requestJsonObject: boolean,
  extraBody?: Record<string, unknown>,
  responseFormatJsonSchema?: NormalizedCompletionRequest["responseFormatJsonSchema"],
  tools?: NormalizedCompletionRequest["tools"],
  toolChoice?: NormalizedCompletionRequest["toolChoice"]
): NormalizedCompletionRequest {
  const stream = binding.stream && enableStream;
  return {
    modelApiName: gatewayModel,
    messages,
    stream,
    temperature: binding.temperature,
    responseFormatJsonObject: requestJsonObject,
    streamIncludeUsage: stream && streamIncludeUsage,
    ...(extraBody && Object.keys(extraBody).length > 0 ? { extraBody } : {}),
    ...(responseFormatJsonSchema ? { responseFormatJsonSchema } : {}),
    ...(tools && tools.length > 0 ? { tools, toolChoice: toolChoice ?? "auto" } : {}),
  };
}

function buildNonStreamBody(
  gatewayModel: string,
  messages: ChatMessage[],
  temperature: number | undefined,
  requestJsonObject: boolean,
  extraBody?: Record<string, unknown>,
  tools?: readonly ToolDefinition[],
  toolChoice?: ToolChoiceOption
): NormalizedCompletionRequest {
  return {
    modelApiName: gatewayModel,
    messages,
    stream: false,
    temperature,
    responseFormatJsonObject: requestJsonObject,
    streamIncludeUsage: false,
    ...(tools && tools.length > 0 ? { tools, toolChoice: toolChoice ?? "auto" } : {}),
    ...(extraBody && Object.keys(extraBody).length > 0 ? { extraBody } : {}),
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
  managedBinding?: ManagedAiBinding;
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
  maxTokensOverride?: number;
  /** Hard cap on actual upstream HTTP model attempts for this turn. */
  maxProviderCalls?: number;
}): Promise<PlayerChatStreamResult> {
  if (params.ctx.task !== "PLAYER_CHAT") {
    console.warn(
      `[ai] executePlayerChatStream: ctx.task should be PLAYER_CHAT (got ${params.ctx.task}); telemetry may be misleading.`
    );
  }
  const env = resolveAiEnv();
  // 检测消息中是否有 [mock_scenario:...] 标记（benchmark/eval --mode mock 注入）。
  // 标记存在时路由到 mock provider，而不经过真实 AI gateway。
  if (env.gatewayProvider === "mock" || isMockAiProviderEnabled() || hasMockScenarioMarker(params.messages)) {
    return executeMockPlayerChatStream({ messages: params.messages, ctx: params.ctx });
  }
  await ensureManagedAiSnapshot();
  const mode = resolveOperationMode();
  const taskBinding = getTaskBinding("PLAYER_CHAT");
  const policy = resolveFallbackPolicy("PLAYER_CHAT", env, mode);
  const timeoutMs = params.timeoutMs ?? taskBinding.timeoutMs;
  const tags = (params.ctx.tags ?? {}) as Record<string, unknown>;
  const riskLane = typeof tags.riskLane === "string" ? tags.riskLane : (typeof tags.riskLane === "number" ? String(tags.riskLane) : "");
  // Phase-3: fast lane prefers quicker failover to avoid long stalls.
  const isFastLane = riskLane === "fast";
  const maxRetriesBase = env.playerChatMaxRetries;
  const skip = new Set(params.skipRoles ?? []);
  const managedBindings = getManagedBindingsForTask("PLAYER_CHAT");
  const intendedLogicalRole = managedBindings[0]?.logicalRole ?? ("writer" as AiLogicalRole);
  const attempts: AiRoutingAttempt[] = [];
  const failureCounts = new Map<string, number>();
  const incFailure = (kind: string) => failureCounts.set(kind, (failureCounts.get(kind) ?? 0) + 1);

  if (managedBindings.length === 0) {
    return {
      ok: false,
      code: "NO_CREDENTIALS",
      message: "后台尚未配置可用的故事生成 AI 服务。",
      intendedLogicalRole,
      operationMode: mode,
      httpAttempts: attempts,
    };
  }

  let lastHttpStatus: number | undefined;
  // Phase-3: avoid repeating provider-wide failures in the same turn.
  // - rate limit: switching models won't help; fail fast
  // - auth: switching models won't help; fail fast
  let sawRateLimit = false;

  const failedServices = new Set<string>();
  let providerCalls = 0;
  for (const managedBinding of managedBindings) {
    if (providerCalls >= Math.max(1, params.maxProviderCalls ?? Number.POSITIVE_INFINITY)) break;
    const role = managedBinding.logicalRole;
    const providerId: AiProviderId =
      managedBinding.transport === "ark_multimodal"
        ? "ark_multimodal"
        : managedBinding.transport === "openai_responses"
          ? "openai_responses"
          : PROVIDER_ID;
    const url = completionEndpoint(managedBinding.baseUrl, managedBinding.transport);
    const key = managedBinding.apiKey;
    if (failedServices.has(managedBinding.serviceId)) continue;
    if (skip.has(role)) continue;

    assertModelAllowedForTask("PLAYER_CHAT", role);
    const gatewayModel = managedBinding.modelName;
    if (!gatewayModel) continue;

    if (policy.tripCircuitOnFailure && (isCircuitOpen(providerId, Date.now(), managedBinding.serviceId) || isModelCircuitOpen(role, Date.now(), managedBinding.modelId))) {
      attempts.push({
        logicalRole: role,
        providerId,
        gatewayModel,
        phase: "http",
        failureKind: "CIRCUIT_SKIP",
        severity: "soft",
        message: "provider_or_model_circuit_open",
      });
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "circuit_skip",
        errorCode: "CIRCUIT_SKIP",
      });
      recordGeneration({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
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
        providerId,
        gatewayModel,
        phase: "http",
        failureKind: "UNKNOWN",
        severity: "soft",
        message: "missing_api_key",
      });
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "fallback",
        message: "missing_api_key",
      });
      recordGeneration({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "fallback",
        message: "missing_api_key",
      });
      continue;
    }

    const factory = getProviderFactory(managedBinding.transport);
    const bodyT0 = Date.now();
    // PLAYER_CHAT has its own transport policy. Do not inherit background
    // reasoning fields (for example reasoning_effort=max) into the realtime
    // Writer request merely because both routes share a managed service.
    const playerChatExtraBody = env.playerChatExtraBody ?? env.gatewayExtraBody;
    // 仅在非 fast-lane 且显式开启 AI_PLAYER_CHAT_JSON_SCHEMA_ENABLED 时
    // 附带 responseFormatJsonSchema。fast lane 保持原有轻量 json_object/relax 行为，
    // 避免给延迟敏感路径新增 schema 预处理开销（见 openai 文档：新 schema 首次请求
    // 有预处理延迟）。
    const useJsonSchemaForThisTurn =
      env.aiGatewayJsonSchemaEnabled && !(isFastLane && env.playerChatFastLaneRelaxResponseFormat);
    // The current Responses-API endpoints (Volcengine Ark agent-plan
    // deepseek-v4-flash) emit non-DM-JSON narrative deltas under
    // `streaming + thinking:disabled + json_object format`. Force
    // non-stream on this transport so we always get a parseable DM JSON
    // payload; the streaming chat route then consumes the virtual stream
    // synthesised by `nonStreamResponsesToChatCompletionsStream`.
    //
    // We also force the full DM JSON schema whenever the transport is
    // Responses-API: that endpoint does not support the Chat Completions
    // `response_format: {type:"json_object"}` flag and silently ignores
    // the equivalent `text.format: {type:"json_object"}` for long structured
    // prompts. The downstream `openaiResponses` factory will downgrade to
    // a minimal schema if `buildPlayerDmJsonSchemaRequest()` is undefined,
    // but the full DM JSON schema gives the provider-level constraint
    // decoder enough surface area to keep the model on the contract.
    const isResponsesTransport = managedBinding.transport === "openai_responses";
    const forceJsonSchemaForResponses = isResponsesTransport;
    const effectiveUseJsonSchema = useJsonSchemaForThisTurn || forceJsonSchemaForResponses;
    const effectiveEnableStream = isResponsesTransport ? false : env.enableStream;
    // The Responses-API endpoint on the Volcengine Ark agent-plan
    // (deepseek-v4-flash) does not honour `text.format: {type:
    // "json_schema", ...}` for the long player-chat prompt. The only
    // reliable way to force a parseable DM JSON payload is to wrap the
    // same schema in a single function tool with `tool_choice` pinning
    // that tool — see `buildPlayerDmJsonToolRequest`.
    //
    // Phase 5.B：flag 开启时优先用 `submit_narrative`（4 字段 subset，state
    // 物理隔离）。否则 fallback 到 `submit_player_turn` envelope path。
    // Provider-level strict tool_choice（A only — server-side 投影降级不放
    // 在这里，冗余）。
    const useNarrativeTool = envBoolean("VERSECRAFT_ENABLE_EXECUTABLE_TOOLS_PLAYER_CHAT", false);
    const toolRequest = isResponsesTransport
      ? useNarrativeTool
        ? buildPlayerNarrativeJsonToolRequest()
        : buildPlayerDmJsonToolRequest()
      : null;
    const body = buildPlayerStreamBody(
      gatewayModel,
      params.messages,
      taskBinding,
      effectiveEnableStream,
      env.playerChatStreamIncludeUsage,
      // When the transport is Responses-API we want a single, explicit
      // json_schema request; passing `responseFormatJsonObject=true` here
      // would make the factory fall back to its minimal schema instead of
      // the full DM JSON schema.
      effectiveUseJsonSchema
        ? false
        : !(isFastLane && env.playerChatFastLaneRelaxResponseFormat) && taskBinding.responseFormatJsonObject,
      playerChatExtraBody,
      // Function-call mode and json_schema mode are mutually exclusive on
      // the Responses-API transport — the provider only engages one
      // constraint decoder at a time. Prefer function-call because it is
      // empirically the only reliable way to extract DM JSON.
      toolRequest
        ? undefined
        : effectiveUseJsonSchema
          ? buildPlayerDmJsonSchemaRequest()
          : undefined,
      toolRequest?.tools,
      toolRequest?.toolChoice
    );
    const bodyBuildMs = Math.max(0, Date.now() - bodyT0);
    const initT0 = Date.now();
    const init = factory.buildInit(key, body);
    const providerInitMs = Math.max(0, Date.now() - initT0);
    const t0 = Date.now();

    logAiTelemetry({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId,
      logicalRole: role,
      gatewayModel,
      phase: "start",
      attempt: 0,
      stream: true,
      bodyBuildMs,
      providerInitMs,
      userId: params.ctx.userId,
    });

    recordGeneration({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId,
      logicalRole: role,
      gatewayModel,
      phase: "start",
      attempt: 0,
      stream: true,
      bodyBuildMs,
      providerInitMs,
      userId: params.ctx.userId,
      inputSnapshot: body as unknown,
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

      // Phase-3: per-role retry budget. First role gets at most 1 retry (unless env already lower).
      // Fallback roles get 0 retries to avoid long chain stalls.
      const isFirstRole = attempts.length === 0;
      const maxRetries = params.maxProviderCalls === 1
        ? 0
        : env.playerChatAggressiveFailover
        ? (isFastLane && env.playerChatFastLaneZeroRetry)
          ? 0
          : isFirstRole
            ? Math.min(1, maxRetriesBase)
            : 0
        : maxRetriesBase;

      providerCalls += 1;
      let res = await resilientFetch(url, init, {
        timeoutMs,
        maxRetries,
        parentSignal: params.signal,
        transport: forceHttp1ForGateway() && url.startsWith("https:") ? "http1" : "default",
        validateManagedUrl: managedBinding.transport !== "mock",
        allowLocalhost: process.env.NODE_ENV !== "production",
        onRetry: () => {
          retryCount += 1;
        },
      });
      lastHttpStatus = res.status;

      // When the managed binding is using the OpenAI Responses API transport,
      // translate the upstream response into the Chat Completions streaming
      // format the rest of the pipeline expects.
      //
      // Some endpoints (notably the current Volcengine Ark agent-plan
      // deepseek-v4-flash) emit non-DM-JSON narrative deltas under
      // `streaming + thinking:disabled + json_object format` and only produce
      // a usable DM JSON payload in non-stream mode. The openaiResponses
      // factory therefore always sends `stream: false`; here we read the JSON
      // body and synthesise a virtual Chat Completions stream so the rest of
      // the player-chat pipeline (TTFT, validator, commit, options regen) is
      // unchanged.
      if (
        res.ok &&
        managedBinding.transport === "openai_responses"
      ) {
        try {
          const raw = (await res.clone().json()) as unknown;
          const id =
            raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string"
              ? String((raw as { id?: unknown }).id)
              : undefined;
          res = new Response(
            nonStreamResponsesToChatCompletionsStream(raw, {
              model: gatewayModel,
              streamId: id,
            }),
            res,
          );
        } catch {
          if (!res.body) {
            res = new Response(
              responsesToChatCompletionsTransform(
                new ReadableStream<Uint8Array>({ start(c) { c.close(); } }),
                { model: gatewayModel },
              ),
              res,
            );
          }
        }
      }

      if (res.ok && res.body) {
        recordModelSuccess(role, providerId, { serviceId: managedBinding.serviceId, modelId: managedBinding.modelId });
        attempts.push({
          logicalRole: role,
          providerId,
          gatewayModel,
          phase: "http",
          latencyMs: Date.now() - t0,
        });
        logAiTelemetry({
          requestId: params.ctx.requestId,
          task: params.ctx.task,
          providerId,
          logicalRole: role,
          gatewayModel,
          phase: "success",
          latencyMs: Date.now() - t0,
          httpStatus: res.status,
          stream: true,
          bodyBuildMs,
          providerInitMs,
          fallbackCount: countFallbacks(attempts),
          retryCount,
          failureScope: "online",
          userId: params.ctx.userId,
        });
        recordGeneration({
          requestId: params.ctx.requestId,
          task: params.ctx.task,
          providerId,
          logicalRole: role,
          gatewayModel,
          phase: "success",
          latencyMs: Date.now() - t0,
          httpStatus: res.status,
          stream: true,
          bodyBuildMs,
          providerInitMs,
          fallbackCount: countFallbacks(attempts),
          retryCount,
          failureScope: "online",
          userId: params.ctx.userId,
        });
        return {
          ok: true,
          response: res,
          logicalRole: role,
          providerId,
          intendedLogicalRole,
          gatewayModel,
          operationMode: mode,
          httpAttempts: attempts,
          managedBinding,
        };
      }

      const { kind, severity } = classifyHttpStatus(res.status);
      const errText = await res.text().catch(() => "");
      if (process.env.VC_DEBUG_HTTP_ERR) console.error("[debug-http-err]", { url, status: res.status, errText: errText.slice(0, 500) });
      incFailure(kind);
      if (kind === "RATE_LIMIT") sawRateLimit = true;
      attempts.push({
        logicalRole: role,
        providerId,
        gatewayModel,
        phase: "http",
        failureKind: kind,
        severity,
        httpStatus: res.status,
        message: errText.slice(0, 400),
        latencyMs: Date.now() - t0,
      });
      if (policy.tripCircuitOnFailure && shouldCountTowardCircuit(kind)) {
        recordModelFailure(role, providerId, { providerScope: "online", countProvider: true, serviceId: managedBinding.serviceId, modelId: managedBinding.modelId });
      }
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "error",
        latencyMs: Date.now() - t0,
        httpStatus: res.status,
        errorCode: kind,
        message: errText.slice(0, 500),
        stream: true,
        bodyBuildMs,
        providerInitMs,
        fallbackCount: countFallbacks(attempts),
        retryCount,
        failureScope: "online",
        userId: params.ctx.userId,
      });
      recordGeneration({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "error",
        latencyMs: Date.now() - t0,
        httpStatus: res.status,
        errorCode: kind,
        message: errText.slice(0, 500),
        stream: true,
        bodyBuildMs,
        providerInitMs,
        fallbackCount: countFallbacks(attempts),
        retryCount,
        failureScope: "online",
        userId: params.ctx.userId,
      });

      // Auth and rate limiting are service-scoped; skip the service and try a configured fallback.
      if (kind === "HTTP_4XX_AUTH" && env.playerChatFailFastOnAuth) {
        failedServices.add(managedBinding.serviceId);
        continue;
      }

      // Phase-3: provider-wide rate limit — stop early to avoid long chain stalls.
      if (kind === "RATE_LIMIT" && env.playerChatFailFastOnRateLimit) {
        failedServices.add(managedBinding.serviceId);
        continue;
      }
    } catch (e) {
      const { kind, severity } = classifyFetchThrowable(e);
      incFailure(kind);
      attempts.push({
        logicalRole: role,
        providerId,
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
        recordModelFailure(role, providerId, { providerScope: "online", countProvider: true, serviceId: managedBinding.serviceId, modelId: managedBinding.modelId });
      }
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "error",
        latencyMs: Date.now() - t0,
        errorCode: kind,
        message: e instanceof Error ? e.message : String(e),
        stream: true,
        bodyBuildMs,
        providerInitMs,
        fallbackCount: countFallbacks(attempts),
        failureScope: "online",
        userId: params.ctx.userId,
      });
      recordGeneration({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
        logicalRole: role,
        gatewayModel,
        phase: "error",
        latencyMs: Date.now() - t0,
        errorCode: kind,
        message: e instanceof Error ? e.message : String(e),
        stream: true,
        bodyBuildMs,
        providerInitMs,
        fallbackCount: countFallbacks(attempts),
        failureScope: "online",
        userId: params.ctx.userId,
      });

      if (sawRateLimit && env.playerChatFailFastOnRateLimit) failedServices.add(managedBinding.serviceId);
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
  extraBody?: Record<string, unknown>;
  /** Function tools；仅离线任务允许（TASK_TOOLS_ALLOWED），违规直接抛错。带 tools 的请求一律绕过响应缓存。 */
  tools?: readonly ToolDefinition[];
  toolChoice?: ToolChoiceOption;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
}): Promise<AIResponse | AIErrorResponse> {
  if (params.task === "PLAYER_CHAT") {
    throw new Error("[ai] PLAYER_CHAT must use executePlayerChatStream(), not executeChatCompletion()");
  }
  const toolsActive = Boolean(params.tools && params.tools.length > 0);
  if (toolsActive) {
    // Policy gate runs before mock short-circuit so tests and dev both observe the same boundary.
    assertToolUseAllowedForTask(params.task);
  }
  if (isMockAiProviderEnabled() || hasMockScenarioMarker(params.messages)) {
    return executeMockChatCompletion({ task: params.task, messages: params.messages, ctx: params.ctx, tools: params.tools, toolChoice: params.toolChoice });
  }
  await ensureManagedAiSnapshot();
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
  /**
   * Phase-2：在线短 JSON 任务（控制面类）优先“更快失败 + 更快 fallback”，避免把补救链拖成长尾等待。
   * - 降低单 provider 的重试次数，让 role chain 更快推进
   * - 不影响主 PLAYER_CHAT（仍使用 executePlayerChatStream 的 playerChatMaxRetries）
   */
  const maxRetries = ONLINE_FAIL_FAST_JSON_TASKS.has(params.task) && env.onlineShortJsonRetryHardCap1
    ? Math.min(1, env.onlineShortJsonMaxRetries)
    : ONLINE_FAIL_FAST_JSON_TASKS.has(params.task)
      ? env.onlineShortJsonMaxRetries
      : env.maxRetries;
  const expectJsonObject = binding.responseFormatJsonObject;
  const failureScope = isOfflineTask(params.task) ? "offline" : "online";
  const managedBindings = getManagedBindingsForTask(params.task);
  const intendedLogicalRole = managedBindings[0]?.logicalRole ?? ("main" as AiLogicalRole);
  const attempts: AiRoutingAttempt[] = [];

  if (managedBindings.length === 0) {
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

  if (params.skipCache !== true && !toolsActive && isCompletionTaskCacheable(params.task)) {
    const cached = await readCompletionCache(params.task, params.messages);
    if (cached) {
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
        userId: params.ctx.userId,
      });
      recordGeneration({
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

  const failedServices = new Set<string>();
  for (const managedBinding of managedBindings) {
    const role = managedBinding.logicalRole;
    const providerId: AiProviderId =
      managedBinding.transport === "ark_multimodal"
        ? "ark_multimodal"
        : managedBinding.transport === "openai_responses"
          ? "openai_responses"
          : PROVIDER_ID;
    const url = completionEndpoint(managedBinding.baseUrl, managedBinding.transport);
    const key = managedBinding.apiKey;
    if (failedServices.has(managedBinding.serviceId)) continue;
    if (params.signal?.aborted) {
      return {
        ok: false,
        code: "ABORTED",
        message: "Request aborted by caller.",
        routing: {
          requestId: params.ctx.requestId,
          task: params.task,
          operationMode: mode,
          intendedRole: intendedLogicalRole,
          actualLogicalRole: null,
          fallbackCount: countFallbacks(attempts),
          attempts,
          finalStatus: "aborted",
          lastFailureSummary: "ABORTED:caller",
        },
      };
    }

    const gatewayModel = managedBinding.modelName;
    if (!gatewayModel) continue;

    if (policy.tripCircuitOnFailure && (isCircuitOpen(providerId, Date.now(), managedBinding.serviceId) || isModelCircuitOpen(role, Date.now(), managedBinding.modelId))) {
      attempts.push({
        logicalRole: role,
        providerId,
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
        providerId,
        gatewayModel,
        phase: "http",
        failureKind: "UNKNOWN",
        severity: "soft",
        message: "missing_api_key",
      });
      continue;
    }

    const factory = getProviderFactory(managedBinding.transport);
    const forceJsonObjectFromOverride = params.devOverrides?.responseFormatJsonObject === true;
    const requestJsonObject =
      expectJsonObject &&
      (forceJsonObjectFromOverride ||
        !(env.onlineShortJsonRelaxResponseFormat && ONLINE_SHORT_JSON_TASKS.has(params.task)));
    const directTaskExtraBody = mergeExtraBody(
      PLAYER_GAMEPLAY_TASKS.has(params.task) ? env.playerChatExtraBody : env.gatewayExtraBody,
      params.extraBody
    );
    const strictJsonTransportExtraBody =
      ONLINE_SHORT_JSON_TASKS.has(params.task) && env.onlineShortJsonDisableThinking
        ? { ...(directTaskExtraBody ?? {}), enable_thinking: false, thinking: { type: "disabled" } }
        : directTaskExtraBody;
    const body = buildNonStreamBody(
      gatewayModel,
      params.messages,
      binding.temperature,
      requestJsonObject,
      strictJsonTransportExtraBody,
      toolsActive ? params.tools : undefined,
      params.toolChoice
    );
    const init = factory.buildInit(key, body);
    const t0 = Date.now();

    logAiTelemetry({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId,
      logicalRole: role,
      gatewayModel,
      phase: "start",
      stream: false,
      userId: params.ctx.userId,
    });

    recordGeneration({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId,
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
        transport: forceHttp1ForGateway() && url.startsWith("https:") ? "http1" : "default",
        validateManagedUrl: managedBinding.transport !== "mock",
        allowLocalhost: process.env.NODE_ENV !== "production",
        onRetry: () => {
          retryCount += 1;
        },
      });

      if (!res.ok) {
        const { kind, severity } = classifyHttpStatus(res.status);
        const errText = await res.text().catch(() => "");
        attempts.push({
          logicalRole: role,
          providerId,
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
          recordModelFailure(role, providerId, {
            providerScope: failureScope,
            countProvider,
            serviceId: managedBinding.serviceId,
            modelId: managedBinding.modelId,
          });
        }
        enqueueManagedUsage(buildManagedUsageRecord({ requestId: params.ctx.requestId, task: params.task, binding: managedBinding,
          phase: `attempt_${attempts.length}`, latencyMs: Date.now() - t0, outcome: "error", errorCategory: kind }));
        if (kind === "HTTP_4XX_AUTH" || kind === "RATE_LIMIT") failedServices.add(managedBinding.serviceId);
        continue;
      }

      const raw = (await res.json()) as unknown;
      const { content, usage, toolCalls } =
        managedBinding.transport === "openai_responses"
          ? extractResponsesNonStreamContent(raw)
          : extractNonStreamContent(raw);
      const trimmed = (content ?? "").trim();
      const hasToolCalls = toolsActive && toolCalls.length > 0;

      // Tool-call 回合：content 允许为空，且不是 JSON 正文，跳过空内容与 JSON 校验。
      if (!trimmed && !hasToolCalls) {
        attempts.push({
          logicalRole: role,
          providerId,
          gatewayModel,
          phase: "http",
          failureKind: "EMPTY_CONTENT",
          severity: "soft",
          message: "empty_message_content",
          latencyMs: Date.now() - t0,
        });
        enqueueManagedUsage(buildManagedUsageRecord({ requestId: params.ctx.requestId, task: params.task, binding: managedBinding,
          phase: `attempt_${attempts.length}`, latencyMs: Date.now() - t0, outcome: "error", errorCategory: "EMPTY_CONTENT" }));
        continue;
      }

      let processed = trimmed;
      let jsonSanitized = false;
      if (expectJsonObject && !hasToolCalls) {
        if (isOfflineTask(params.task)) {
          const s = sanitizeReasonerJsonText(trimmed);
          processed = s.content;
          jsonSanitized = s.sanitized;
        } else if (STRICT_JSON_TRANSPORT_TASKS.has(params.task)) {
          const s = sanitizeOnlineShortJsonText(trimmed);
          processed = s.content;
          jsonSanitized = s.sanitized;
        }
      }

      if (expectJsonObject && !hasToolCalls && !isValidJsonObjectString(processed)) {
        attempts.push({
          logicalRole: role,
          providerId,
          gatewayModel,
          phase: "http",
          failureKind: "JSON_PARSE",
          severity: "soft",
          message: "invalid_json_object",
          latencyMs: Date.now() - t0,
        });
        enqueueManagedUsage(buildManagedUsageRecord({ requestId: params.ctx.requestId, task: params.task, binding: managedBinding,
          phase: `attempt_${attempts.length}`, latencyMs: Date.now() - t0, outcome: "error", errorCategory: "JSON_PARSE" }));
        continue;
      }

      recordModelSuccess(role, providerId, { providerScope: failureScope, serviceId: managedBinding.serviceId, modelId: managedBinding.modelId });
      attempts.push({
        logicalRole: role,
        providerId,
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

      enqueueManagedUsage(buildManagedUsageRecord({
        requestId: params.ctx.requestId,
        task: params.task,
        binding: managedBinding,
        phase: "complete",
        usage,
        inputText: params.messages.map((message) => message.content).join("\n"),
        outputText: processed,
        latencyMs: Date.now() - t0,
        outcome: "success",
      }));
      logAiTelemetry({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
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
        userId: params.ctx.userId,
        ...(hasToolCalls ? { toolCallCount: toolCalls.length } : {}),
      });
      recordGeneration({
        requestId: params.ctx.requestId,
        task: params.ctx.task,
        providerId,
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
        userId: params.ctx.userId,
        ...(hasToolCalls ? { toolCallCount: toolCalls.length } : {}),
      });

      if (params.skipCache !== true && !toolsActive && isCompletionTaskCacheable(params.task)) {
        const ttl = completionCacheTtlSec(params.task);
        void writeCompletionCache(
          params.task,
          params.messages,
          {
            content: processed,
            logicalRole: role,
            gatewayModel,
            providerId,
            usage,
          },
          ttl
        ).catch(() => {});
      }

      return {
        ok: true,
        providerId,
        logicalRole: role,
        content: processed,
        usage,
        latencyMs: Date.now() - t0,
        routing,
        ...(hasToolCalls ? { toolCalls } : {}),
      };
    } catch (e) {
      const { kind, severity } = classifyFetchThrowable(e);
      attempts.push({
        logicalRole: role,
        providerId,
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
        recordModelFailure(role, providerId, {
          providerScope: failureScope,
          countProvider,
          serviceId: managedBinding.serviceId,
          modelId: managedBinding.modelId,
        });
      }
      enqueueManagedUsage(buildManagedUsageRecord({ requestId: params.ctx.requestId, task: params.task, binding: managedBinding,
        phase: `attempt_${attempts.length}`, latencyMs: Date.now() - t0, outcome: "error", errorCategory: kind }));
      if (kind === "ABORTED" || params.signal?.aborted) {
        return {
          ok: false,
          code: "ABORTED",
          message: "Request aborted by caller.",
          routing: {
            requestId: params.ctx.requestId,
            task: params.task,
            operationMode: mode,
            intendedRole: intendedLogicalRole,
            actualLogicalRole: null,
            fallbackCount: countFallbacks(attempts),
            attempts,
            finalStatus: "aborted",
            lastFailureSummary: `${kind}:${role}`,
          },
        };
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

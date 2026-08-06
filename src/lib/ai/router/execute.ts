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
import { resilientFetch, forceHttp1ForGateway } from "@/lib/ai/resilience/fetchWithRetry";
import { extractNonStreamContent } from "@/lib/ai/stream/openaiLike";
import {
  assertModelAllowedForTask,
  assertToolUseAllowedForTask,
  getTaskBinding,
  resolveFallbackPolicy,
  resolveOrderedRoleChain,
  type TaskBinding,
} from "@/lib/ai/tasks/taskPolicy";
import { estimateUsdForUsage } from "@/lib/ai/governance/costModel";
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
import { buildPlayerDmJsonSchemaRequest } from "@/lib/ai/schemas/playerDmJsonSchema";
import type { AiCostRecord } from "@/lib/ai/telemetry/log";

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

const PROVIDER_ID = "oneapi" as const satisfies AiProviderId;

function isOfflineTask(task: TaskType): boolean {
  return (
    task === "WORLDBUILD_OFFLINE" ||
    task === "STORYLINE_SIMULATION" ||
    task === "DIRECTOR_PLAN_CRITIC" ||
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
  "SCENE_ENHANCEMENT",
  "NARRATIVE_EXPANSION",
  "NPC_EMOTION_POLISH",
  "GAMEPLAY_LOCALIZATION",
  "DM_AGENT",
]);

function resolveGatewayModelForTask(
  env: ReturnType<typeof resolveAiEnv>,
  task: TaskType,
  role: AiLogicalRole
): string {
  if (PLAYER_GAMEPLAY_TASKS.has(task) && env.playerGameplayModel) {
    return env.playerGameplayModel;
  }
  return env.modelsByRole[role];
}

function hasDirectPlayerSplit(env: ReturnType<typeof resolveAiEnv>): boolean {
  return Boolean(env.playerGameplayModel);
}

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

const ONLINE_FAIL_FAST_JSON_TASKS = new Set<TaskType>([
  ...ONLINE_SHORT_JSON_TASKS,
  "NARRATIVE_EXPANSION",
]);

function gatewayEndpoint(env: ReturnType<typeof resolveAiEnv>): { url: string; key: string } {
  return { url: env.gatewayBaseUrl, key: env.gatewayApiKey };
}

function buildPlayerStreamBody(
  gatewayModel: string,
  messages: ChatMessage[],
  binding: TaskBinding,
  enableStream: boolean,
  streamIncludeUsage: boolean,
  requestJsonObject: boolean,
  extraBody?: Record<string, unknown>,
  responseFormatJsonSchema?: NormalizedCompletionRequest["responseFormatJsonSchema"]
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
  const fullChain = resolveOrderedRoleChain("PLAYER_CHAT", env, mode);
  const intendedLogicalRole = fullChain[0] ?? ("main" as AiLogicalRole);
  const attempts: AiRoutingAttempt[] = [];
  const failureCounts = new Map<string, number>();
  const incFailure = (kind: string) => failureCounts.set(kind, (failureCounts.get(kind) ?? 0) + 1);

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

  // Phase-3: avoid repeating provider-wide failures in the same turn.
  // - rate limit: switching models won't help; fail fast
  // - auth: switching models won't help; fail fast
  let sawRateLimit = false;

  for (const role of policy.chain) {
    if (skip.has(role)) continue;

    assertModelAllowedForTask("PLAYER_CHAT", role);
    const gatewayModel = resolveGatewayModelForTask(env, "PLAYER_CHAT", role);
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
      recordGeneration({
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
      recordGeneration({
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
    const bodyT0 = Date.now();
    const playerChatExtraBody = hasDirectPlayerSplit(env)
      ? env.playerChatExtraBody
      : env.playerChatExtraBody && Object.keys(env.playerChatExtraBody).length > 0
        ? { ...(env.gatewayExtraBody ?? {}), ...env.playerChatExtraBody }
        : env.gatewayExtraBody;
    // T2（2026-07）：仅在非 fast-lane 且显式开启 AI_GATEWAY_JSON_SCHEMA_ENABLED 时
    // 附带 responseFormatJsonSchema。fast lane 保持原有轻量 json_object/relax 行为，
    // 避免给延迟敏感路径新增 schema 预处理开销（见 openai 文档：新 schema 首次请求
    // 有预处理延迟）。
    const useJsonSchemaForThisTurn =
      env.aiGatewayJsonSchemaEnabled && !(isFastLane && env.playerChatFastLaneRelaxResponseFormat);
    const body = buildPlayerStreamBody(
      gatewayModel,
      params.messages,
      taskBinding,
      env.enableStream,
      env.playerChatStreamIncludeUsage,
      !(isFastLane && env.playerChatFastLaneRelaxResponseFormat) && taskBinding.responseFormatJsonObject,
      playerChatExtraBody,
      useJsonSchemaForThisTurn ? buildPlayerDmJsonSchemaRequest() : undefined
    );
    const bodyBuildMs = Math.max(0, Date.now() - bodyT0);
    const initT0 = Date.now();
    const init = factory.buildInit(key, body);
    const providerInitMs = Math.max(0, Date.now() - initT0);
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
      bodyBuildMs,
      providerInitMs,
      userId: params.ctx.userId,
    });

    recordGeneration({
      requestId: params.ctx.requestId,
      task: params.ctx.task,
      providerId: PROVIDER_ID,
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
      const maxRetries = env.playerChatAggressiveFailover
        ? (isFastLane && env.playerChatFastLaneZeroRetry)
          ? 0
          : isFirstRole
            ? Math.min(1, maxRetriesBase)
            : 0
        : maxRetriesBase;

      const res = await resilientFetch(url, init, {
        timeoutMs,
        maxRetries,
        parentSignal: params.signal,
        transport: forceHttp1ForGateway() && url.startsWith("https:") ? "http1" : "default",
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
          providerId: PROVIDER_ID,
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
          providerId: PROVIDER_ID,
          intendedLogicalRole,
          gatewayModel,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }

      const { kind, severity } = classifyHttpStatus(res.status);
      const errText = await res.text().catch(() => "");
      incFailure(kind);
      if (kind === "RATE_LIMIT") sawRateLimit = true;
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
        providerId: PROVIDER_ID,
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

      // Phase-3: fail fast for auth errors; cycling models won't help.
      if (kind === "HTTP_4XX_AUTH" && env.playerChatFailFastOnAuth) {
        return {
          ok: false,
          code: "NO_CREDENTIALS",
          message: "上游鉴权失败（401/403）。请检查 AI 网关密钥或上游权限配置。",
          lastHttpStatus: res.status,
          intendedLogicalRole,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }

      // Phase-3: provider-wide rate limit — stop early to avoid long chain stalls.
      if (kind === "RATE_LIMIT" && env.playerChatFailFastOnRateLimit) {
        return {
          ok: false,
          code: "CHAIN_EXHAUSTED",
          message: "上游限流（429）。已停止继续切换模型，避免长时间等待，请稍后重试。",
          lastHttpStatus: res.status,
          intendedLogicalRole,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }
    } catch (e) {
      const { kind, severity } = classifyFetchThrowable(e);
      incFailure(kind);
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
        bodyBuildMs,
        providerInitMs,
        fallbackCount: countFallbacks(attempts),
        failureScope: "online",
        userId: params.ctx.userId,
      });
      recordGeneration({
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
        bodyBuildMs,
        providerInitMs,
        fallbackCount: countFallbacks(attempts),
        failureScope: "online",
        userId: params.ctx.userId,
      });

      // Phase-3: if we already saw rate limit earlier, don't keep cycling on subsequent errors.
      if (sawRateLimit && env.playerChatFailFastOnRateLimit) {
        return {
          ok: false,
          code: "CHAIN_EXHAUSTED",
          message: "上游限流后出现连续失败，已停止继续切换模型以避免长等待。",
          lastHttpStatus,
          intendedLogicalRole,
          operationMode: mode,
          httpAttempts: attempts,
        };
      }
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

  if (params.skipCache !== true && !toolsActive && isCompletionTaskCacheable(params.task)) {
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

    const gatewayModel = resolveGatewayModelForTask(env, params.task, role);
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
    const forceJsonObjectFromOverride = params.devOverrides?.responseFormatJsonObject === true;
    const requestJsonObject =
      expectJsonObject &&
      (forceJsonObjectFromOverride ||
        !(env.onlineShortJsonRelaxResponseFormat && ONLINE_SHORT_JSON_TASKS.has(params.task)));
    const directTaskExtraBody = hasDirectPlayerSplit(env)
      ? mergeExtraBody(
          PLAYER_GAMEPLAY_TASKS.has(params.task) ? env.playerChatExtraBody : env.gatewayExtraBody,
          params.extraBody
        )
      : params.extraBody;
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
      providerId: PROVIDER_ID,
      logicalRole: role,
      gatewayModel,
      phase: "start",
      stream: false,
      userId: params.ctx.userId,
    });

    recordGeneration({
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
        transport: forceHttp1ForGateway() && url.startsWith("https:") ? "http1" : "default",
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
      const { content, usage, toolCalls } = extractNonStreamContent(raw);
      const trimmed = (content ?? "").trim();
      const hasToolCalls = toolsActive && toolCalls.length > 0;

      // Tool-call 回合：content 允许为空，且不是 JSON 正文，跳过空内容与 JSON 校验。
      if (!trimmed && !hasToolCalls) {
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
        ...(hasToolCalls ? { toolCallCount: toolCalls.length } : {}),
      });
      recordGeneration({
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
        ...(hasToolCalls ? { toolCalls } : {}),
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

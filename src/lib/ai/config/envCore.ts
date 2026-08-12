// src/lib/ai/config/envCore.ts
/**
 * AI env resolution without `server-only` so Node unit tests (tsx) can import safely.
 * App code should import `@/lib/ai/config/env` (adds server-only guard).
 */
import {
  type AiLogicalRole,
  AI_LOGICAL_ROLES,
  legacyVendorModelIdToRole,
  normalizeAiLogicalRole,
  parseRoleChain,
} from "@/lib/ai/models/logicalRoles";
import { envBoolean, envEnum, envNumber, envRaw } from "@/lib/config/envRaw";
import { clamp } from "@/lib/clamp";
import { VC_WAITING } from "@/lib/perf/waitingConfig";

function resolveExtraBodyJson(envName: string): Record<string, unknown> | undefined {
  const raw = envRaw(envName)?.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* invalid JSON → no merge */
  }
  return undefined;
}

function resolveGatewayExtraBody(): Record<string, unknown> | undefined {
  if (!envBoolean("AI_GATEWAY_MERGE_EXTRA_BODY", false)) return undefined;
  return resolveExtraBodyJson("AI_GATEWAY_EXTRA_BODY_JSON");
}

function resolvePlayerChatExtraBody(): Record<string, unknown> | undefined {
  const defaults = envBoolean("AI_PLAYER_CHAT_DISABLE_THINKING", true)
    ? {
        enable_thinking: false,
        thinking: { type: "disabled" },
      }
    : {};
  const explicit = envBoolean("AI_PLAYER_CHAT_MERGE_EXTRA_BODY", false)
    ? (resolveExtraBodyJson("AI_PLAYER_CHAT_EXTRA_BODY_JSON") ?? {})
    : {};
  const merged = { ...defaults, ...explicit };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Gateway deployment kind. `oneapi` means an actual one-api deployment;
 * `openai_compatible` is a direct OpenAI-wire-compatible endpoint.
 */
export type AiGatewayProviderId = "oneapi" | "openai_compatible" | "mock";

export interface ResolvedAiEnv {
  gatewayProvider: AiGatewayProviderId;
  /** Resolved chat/completions URL (includes /v1/chat/completions when base is root). */
  gatewayBaseUrl: string;
  gatewayApiKey: string;
  /** Optional task-scoped model for the realtime player/gameplay lane only. */
  playerGameplayModel: string;
  /** Upstream model name per logical role (from AI_MODEL_*). Empty if unset. */
  modelsByRole: Record<AiLogicalRole, string>;
  /** Extra ordering for PLAYER_CHAT merges (after policy primaries). */
  playerRoleFallbackChain: AiLogicalRole[];
  /** Prepended role for MEMORY_COMPRESSION chain. */
  memoryPrimaryRole: AiLogicalRole;
  /** Prepended role for DEV_ASSIST chain. */
  devAssistPrimaryRole: AiLogicalRole;
  defaultTimeoutMs: number;
  maxRetries: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  exposeAiRoutingHeader: boolean;
  /** Task requests stream only if binding.stream && enableStream. */
  enableStream: boolean;
  logLevel: "silent" | "error" | "info" | "debug";
  /** Two role=system messages (stable + dynamic) for PLAYER_CHAT when true. */
  splitPlayerChatDualSystem: boolean;
  /** Keep enhancement pipeline enabled by default; explicit env can still disable it. */
  enableNarrativeEnhancement: boolean;
  /** Optional post-stream narrative-only expansion; never required for first visible token. */
  enableNarrativeExpansion: boolean;
  /**
   * PLAYER_CHAT: whether to request stream_options.include_usage from upstream.
   * Disabled can reduce vendor overhead and payload size; usage still best-effort via fallback estimation.
   */
  playerChatStreamIncludeUsage: boolean;
  /**
   * PLAYER_CHAT fast lane: when true, do not request provider-side json_object
   * mode for the live stream. The prompt, parser, normalizer, and final frame
   * guards still enforce the DM JSON contract locally.
   */
  playerChatFastLaneRelaxResponseFormat: boolean;
  /**
   * T2（技术改良，2026-07）：当为 true 时，PLAYER_CHAT 请求改用
   * `responseFormatJsonSchema`（见 src/lib/ai/schemas/playerDmJsonSchema.ts）
   * 而不是纯 `response_format:{type:"json_object"}`。默认 false——
   * 并非所有 OpenAI 兼容网关背后的模型都支持 `json_schema` response_format，
   * 开启前请先在目标环境用 pnpm test:e2e:chat 确认网关/模型返回 200 而非 4xx。
   * 当前 schema 是 strict:false（结构提示，非硬约束解码），见该文件顶部注释。
   */
  aiGatewayJsonSchemaEnabled: boolean;
  /**
   * PLAYER_CHAT: cap candidate role count (after forbidden + configured-model filter).
   * 0 = no cap (legacy).
   */
  playerChatMaxRoleCandidates: number;
  /**
   * PLAYER_CHAT: max retries per upstream HTTP attempt (per role).
   * Lower reduces first-byte tail amplification; fallback/circuit still applies.
   */
  playerChatMaxRetries: number;
  /**
   * PLAYER_CHAT: per-upstream-attempt timeout by risk lane.
   * Keeps normal turns from being stretched by provider stalls while preserving
   * slow-lane room for heavier adjudication.
   */
  playerChatFastLaneTimeoutMs: number;
  playerChatSlowLaneTimeoutMs: number;
  /**
   * PLAYER_CHAT: wall-clock limit after which stream-body reconnect is skipped.
   * 0 = legacy 40s reconnect window.
   */
  playerChatStreamReconnectWallMs: number;
  /**
   * PLAYER_CHAT: optional per-turn max_tokens rollback override. Null means use
   * narrative-budget tier mapping at the caller/task-policy layer.
   */
  playerChatMaxTokensOverride: number | null;
  /** Online short JSON tasks: max retries (default 0 to avoid TTFT amplification). */
  onlineShortJsonMaxRetries: number;
  /** Online short JSON tasks: true is an explicit compatibility rollback that omits json_object. */
  onlineShortJsonRelaxResponseFormat: boolean;
  /** Disable provider reasoning tokens for short control/risk JSON to preserve output budget. */
  onlineShortJsonDisableThinking: boolean;
  /**
   * Online short JSON tasks: when true, disallow falling back to MAIN (keep control-plane fast).
   */
  onlineShortJsonDisableMainFallback: boolean;
  /**
   * Phase-6 flags: can be toggled independently for safe rollback.
   * Defaults are tuned for player-facing latency without obvious quality drop.
   */
  playerChatAggressiveFailover: boolean;
  playerChatFastLaneZeroRetry: boolean;
  playerChatFailFastOnAuth: boolean;
  playerChatFailFastOnRateLimit: boolean;
  onlineShortJsonRetryHardCap1: boolean;
  /** Parsed AI_GATEWAY_EXTRA_BODY_JSON when AI_GATEWAY_MERGE_EXTRA_BODY=1. */
  gatewayExtraBody?: Record<string, unknown>;
  /** Parsed AI_PLAYER_CHAT_EXTRA_BODY_JSON when AI_PLAYER_CHAT_MERGE_EXTRA_BODY=1. */
  playerChatExtraBody?: Record<string, unknown>;
  /**
   * Wall-clock cap to wait for control preflight before treating as unavailable (same as API failure).
   * 0 = wait for full upstream timeout (legacy).
   */
  controlPreflightBudgetMs: number;
  /**
   * Max time for optional narrative enhancement LLM; 0 = wait for task timeout only (legacy).
   */
  narrativeEnhanceBudgetMs: number;
  /**
   * Min interval between postModelModeration calls on stream deltas; 0 = moderate every delta (legacy).
   */
  streamModerationThrottleMs: number;
  /**
   * Wall-clock cap for runtime lore retrieval before degrading to fallback path.
   * 0 = no extra budget cap (legacy).
   */
  loreRetrievalBudgetMs: number;
  /** Fail-fast guard for offline reasoner tasks to avoid long tail multiplier. */
  offlineFailFast: boolean;
  /** Allow WORLDBUILD/DEV_ASSIST to fallback from reasoner to main. */
  offlineAllowMainFallback: boolean;
  /** Whether offline failures should count toward provider-level circuit. */
  offlineAffectsProviderCircuit: boolean;
  /** Peak budget mode tightens offline timeouts/token caps. */
  offlineBudgetProfile: "default" | "peak";
}

/** Default player SSE fallback role order when env omits chain. */
export const DEFAULT_PLAYER_ROLE_CHAIN: AiLogicalRole[] = ["main", "control"];

type KimiOpenAiBinding = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

/**
 * Inherit an OpenAI-compatible binding from a running Kimi session. The
 * provider-type guard keeps ordinary Kimi sessions on VerseCraft's normal
 * gateway configuration, while existing `kimi -ds` sessions can hand their
 * already-in-memory binding to a child Next.js process without a restart.
 */
function resolveKimiOpenAiBinding(): KimiOpenAiBinding | undefined {
  if ((envRaw("KIMI_MODEL_PROVIDER_TYPE") ?? "").trim().toLowerCase() !== "openai") {
    return undefined;
  }
  const baseUrl = (envRaw("KIMI_MODEL_BASE_URL") ?? "").trim();
  const apiKey = (envRaw("KIMI_MODEL_API_KEY") ?? "").trim();
  const model = (envRaw("KIMI_MODEL_NAME") ?? "").trim();
  if (!baseUrl || !apiKey || !model) return undefined;
  return { baseUrl, apiKey, model };
}

function resolveGatewayChatCompletionsUrl(): string {
  // Local-only direct-provider override. Its distinct prefix prevents Next's
  // .env.local loading from replacing an explicitly injected test binding.
  const raw = (
    envRaw("VC_AI_DIRECT_BASE_URL") ??
    resolveKimiOpenAiBinding()?.baseUrl ??
    envRaw("AI_GATEWAY_BASE_URL") ??
    ""
  ).trim();
  if (!raw) return "";
  const normalized = raw.replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.toLowerCase().endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

/**
 * T4（2026-07，世界知识向量检索）：embeddings 端点 URL。
 * 默认复用与 chat completions 相同的网关根地址（`AI_GATEWAY_BASE_URL`），只是把
 * `/v1/chat/completions` 换成 `/v1/embeddings`——这是 one-api 及绝大多数 OpenAI 兼容网关的
 * 标准约定，不需要新增独立的 base url 配置。仅当 embeddings 走独立网关/独立域名时才需要
 * 显式设置 `AI_EMBEDDING_GATEWAY_BASE_URL` 覆盖。
 */
function resolveGatewayEmbeddingsUrl(): string {
  const explicit = envRaw("AI_EMBEDDING_GATEWAY_BASE_URL")?.trim();
  const base = explicit || (envRaw("AI_GATEWAY_BASE_URL")?.trim() ?? "");
  if (!base) return "";
  const normalized = base.replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/embeddings")) return normalized;
  if (normalized.toLowerCase().endsWith("/chat/completions")) {
    return normalized.replace(/\/chat\/completions$/i, "/embeddings");
  }
  return `${normalized}/v1/embeddings`;
}

export function resolveAiProviderId(): AiGatewayProviderId {
  const raw = (envRaw("AI_PROVIDER") ?? envRaw("AI_GATEWAY_PROVIDER") ?? "oneapi").trim().toLowerCase();
  if (raw === "mock") return "mock";
  if (
    resolveKimiOpenAiBinding() ||
    envRaw("VC_AI_DIRECT_BASE_URL") ||
    ["openai", "openai-compatible", "openai_compatible", "direct"].includes(raw)
  ) {
    return "openai_compatible";
  }
  return "oneapi";
}

export function isMockAiProviderEnv(): boolean {
  return resolveAiProviderId() === "mock";
}

function readModelForRole(role: AiLogicalRole): string {
  const key =
    role === "main"
      ? "AI_MODEL_MAIN"
      : role === "control"
        ? "AI_MODEL_CONTROL"
        : role === "enhance"
          ? "AI_MODEL_ENHANCE"
          : role === "reasoner"
            ? "AI_MODEL_REASONER"
            : role === "writer"
              ? "AI_MODEL_WRITER"
              : "AI_MODEL_MAIN";
  const directRoleOverride = (
    envRaw(`VC_AI_DIRECT_MODEL_${role.toUpperCase()}`) ?? ""
  ).trim();
  const directAllRolesOverride = (envRaw("VC_AI_DIRECT_MODEL") ?? "").trim();
  const directOverride =
    directRoleOverride || directAllRolesOverride || (resolveKimiOpenAiBinding()?.model ?? "").trim();
  let direct = directOverride || (envRaw(key) ?? "").trim();
  // Writer role: fall back to AI_MODEL_MAIN when AI_MODEL_WRITER is not configured.
  // Also respects VC_AI_DIRECT_MODEL_MAIN override so writer inherits the main role's direct model.
  if (role === "writer" && !direct) {
    const mainKey = "AI_MODEL_MAIN";
    const mainDirectRoleOverride = (envRaw("VC_AI_DIRECT_MODEL_MAIN") ?? "").trim();
    const mainDirect = mainDirectRoleOverride || directAllRolesOverride || (envRaw(mainKey) ?? "").trim();
    direct = mainDirect;
  }
  if (isMockAiProviderEnv()) {
    return direct.length > 0 ? direct : `mock-${role}`;
  }
  if (role === "enhance") {
    return direct.length > 0 ? direct : "vc-enhance";
  }
  if (role === "reasoner") {
    return direct.length > 0 ? direct : "vc-reasoner";
  }
  return direct;
}

function resolvePlayerRoleFallbackChain(): AiLogicalRole[] {
  const roleExplicit = envRaw("AI_PLAYER_ROLE_CHAIN");
  if (roleExplicit?.trim()) {
    return parseRoleChain(roleExplicit, DEFAULT_PLAYER_ROLE_CHAIN);
  }
  const legacy = envRaw("AI_PLAYER_MODEL_CHAIN");
  if (legacy?.trim()) {
    const parts = legacy
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const out: AiLogicalRole[] = [];
    const seen = new Set<AiLogicalRole>();
    for (const p of parts) {
      const r = legacyVendorModelIdToRole(p);
      if (!r || seen.has(r)) continue;
      seen.add(r);
      out.push(r);
    }
    return out.length > 0 ? out : DEFAULT_PLAYER_ROLE_CHAIN;
  }
  return DEFAULT_PLAYER_ROLE_CHAIN;
}

function resolvePlayerChatMaxTokensOverride(): number | null {
  const raw = envRaw("AI_PLAYER_CHAT_MAX_TOKENS_OVERRIDE");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultNarrativeExpansionEnabled(): boolean {
  return true;
}

function resolveMemoryPrimaryRole(): AiLogicalRole {
  const fromRole = normalizeAiLogicalRole(envRaw("AI_MEMORY_PRIMARY_ROLE"));
  if (fromRole) return fromRole;
  const legacy = envRaw("AI_MEMORY_MODEL");
  if (legacy?.trim()) {
    const r = legacyVendorModelIdToRole(legacy.trim());
    if (r) return r;
  }
  return "main";
}

function resolveDevAssistPrimaryRole(): AiLogicalRole {
  const fromRole = normalizeAiLogicalRole(envRaw("AI_DEV_ASSIST_PRIMARY_ROLE"));
  if (fromRole) return fromRole;
  const legacy = envRaw("AI_ADMIN_MODEL");
  if (legacy?.trim()) {
    const r = legacyVendorModelIdToRole(legacy.trim());
    if (r) return r;
  }
  return "reasoner";
}

let warnedLegacyPlayerModelChain = false;

export function resolveAiEnv(): ResolvedAiEnv {
  if (
    process.env.NODE_ENV === "development" &&
    !warnedLegacyPlayerModelChain &&
    envRaw("AI_PLAYER_MODEL_CHAIN")?.trim() &&
    !envRaw("AI_PLAYER_ROLE_CHAIN")?.trim()
  ) {
    warnedLegacyPlayerModelChain = true;
    console.warn(
      "[VerseCraft AI] 检测到 AI_PLAYER_MODEL_CHAIN；建议迁移为 AI_PLAYER_ROLE_CHAIN（main/control/enhance/reasoner）。说明见 docs/ai-gateway.md#legacy-migration"
    );
  }

  const gatewayProvider = resolveAiProviderId();
  const gatewayBaseUrl = gatewayProvider === "mock" ? "mock://chat/completions" : resolveGatewayChatCompletionsUrl();
  const gatewayApiKey = gatewayProvider === "mock"
    ? "mock-key"
    : (
        envRaw("VC_AI_DIRECT_API_KEY") ??
        resolveKimiOpenAiBinding()?.apiKey ??
        envRaw("AI_GATEWAY_API_KEY") ??
        ""
      ).trim();

  const modelsByRole = {} as Record<AiLogicalRole, string>;
  for (const r of AI_LOGICAL_ROLES) {
    modelsByRole[r] = readModelForRole(r);
  }
  const playerChatTimeoutsV2 = envBoolean("AI_PLAYER_CHAT_TIMEOUTS_V2", true);

  return {
    gatewayProvider,
    gatewayBaseUrl,
    gatewayApiKey,
    playerGameplayModel: (envRaw("VC_AI_DIRECT_PLAYER_MODEL") ?? "").trim(),
    modelsByRole,
    playerRoleFallbackChain: resolvePlayerRoleFallbackChain(),
    memoryPrimaryRole: resolveMemoryPrimaryRole(),
    devAssistPrimaryRole: resolveDevAssistPrimaryRole(),
    defaultTimeoutMs: (() => {
      const primary = envNumber("AI_TIMEOUT_MS", NaN);
      return Number.isFinite(primary) ? primary : envNumber("AI_REQUEST_TIMEOUT_MS", 60_000);
    })(),
    maxRetries: (() => {
      const primary = envNumber("AI_MAX_RETRIES", NaN);
      return Number.isFinite(primary) ? primary : envNumber("AI_RETRY_COUNT", 2);
    })(),
    circuitFailureThreshold: envNumber("AI_CIRCUIT_FAILURE_THRESHOLD", 4),
    circuitCooldownMs: envNumber("AI_CIRCUIT_COOLDOWN_MS", 60_000),
    exposeAiRoutingHeader: envBoolean("AI_EXPOSE_ROUTING_HEADER", false),
    enableStream: envBoolean("AI_ENABLE_STREAM", true),
    logLevel: envEnum("AI_LOG_LEVEL", ["silent", "error", "info", "debug"] as const, "info"),
    splitPlayerChatDualSystem: envBoolean("AI_PLAYER_CHAT_SPLIT_SYSTEM", false),
    enableNarrativeEnhancement: envBoolean("AI_ENABLE_NARRATIVE_ENHANCEMENT", true),
    enableNarrativeExpansion: envBoolean(
      "AI_NARRATIVE_EXPANSION_ENABLED",
      defaultNarrativeExpansionEnabled()
    ),
    playerChatStreamIncludeUsage: envBoolean("AI_PLAYER_CHAT_STREAM_INCLUDE_USAGE", false),
    playerChatFastLaneRelaxResponseFormat: envBoolean("AI_PLAYER_CHAT_FASTLANE_RELAX_RESPONSE_FORMAT", false),
    aiGatewayJsonSchemaEnabled: envBoolean("AI_GATEWAY_JSON_SCHEMA_ENABLED", false),
    playerChatMaxRoleCandidates: clamp(envNumber("AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES", 2), 0, 6),
    playerChatMaxRetries: (() => {
      const override = envNumber("AI_PLAYER_CHAT_MAX_RETRIES", NaN);
      const base = Number.isFinite(override) ? override : envNumber("AI_MAX_RETRIES", NaN);
      const resolved = Number.isFinite(base) ? base : envNumber("AI_RETRY_COUNT", 2);
      // Conservative cap for player-facing TTFT: allow explicit override, but never exceed 4.
      return clamp(resolved, 0, 4);
    })(),
    playerChatFastLaneTimeoutMs: Math.max(
      3_000,
      Math.min(60_000, envNumber("AI_PLAYER_CHAT_FASTLANE_TIMEOUT_MS", playerChatTimeoutsV2 ? 18_000 : 60_000))
    ),
    playerChatSlowLaneTimeoutMs: Math.max(
      8_000,
      Math.min(90_000, envNumber("AI_PLAYER_CHAT_SLOWLANE_TIMEOUT_MS", playerChatTimeoutsV2 ? 45_000 : 60_000))
    ),
    playerChatStreamReconnectWallMs: Math.max(
      0,
      Math.min(
        120_000,
        envNumber(
          "AI_PLAYER_CHAT_STREAM_RECONNECT_WALL_MS",
          playerChatTimeoutsV2 ? VC_WAITING.playerChatStreamReconnectWallDefaultMs : 0
        )
      )
    ),
    playerChatMaxTokensOverride: resolvePlayerChatMaxTokensOverride(),
    onlineShortJsonMaxRetries: (() => {
      const override = envNumber("AI_ONLINE_SHORT_JSON_MAX_RETRIES", NaN);
      // Default to 0 (fast fail), but allow explicit override.
      const resolved = Number.isFinite(override) ? override : 0;
      return clamp(resolved, 0, 3);
    })(),
    // DeepSeek and the supported one-api gateways accept json_object. Keep a
    // named opt-out for legacy providers, but do not make malformed control
    // output the default behavior for player-facing intent/risk decisions.
    onlineShortJsonRelaxResponseFormat: envBoolean("AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT", false),
    onlineShortJsonDisableThinking: envBoolean("AI_ONLINE_SHORT_JSON_DISABLE_THINKING", true),
    onlineShortJsonDisableMainFallback: envBoolean("AI_ONLINE_SHORT_JSON_DISABLE_MAIN_FALLBACK", true),
    playerChatAggressiveFailover: envBoolean("AI_PLAYER_CHAT_AGGRESSIVE_FAILOVER", true),
    playerChatFastLaneZeroRetry: envBoolean("AI_PLAYER_CHAT_FASTLANE_ZERO_RETRY", true),
    playerChatFailFastOnAuth: envBoolean("AI_PLAYER_CHAT_FAILFAST_AUTH", true),
    playerChatFailFastOnRateLimit: envBoolean("AI_PLAYER_CHAT_FAILFAST_RATELIMIT", true),
    onlineShortJsonRetryHardCap1: envBoolean("AI_ONLINE_SHORT_JSON_RETRY_HARDCAP_1", true),
    gatewayExtraBody: resolveGatewayExtraBody(),
    playerChatExtraBody: resolvePlayerChatExtraBody(),
    controlPreflightBudgetMs: Math.max(
      0,
      Math.min(
        10_000,
        envNumber("AI_CONTROL_PREFLIGHT_BUDGET_MS", VC_WAITING.controlPreflightDefaultBudgetMs)
      )
    ),
    narrativeEnhanceBudgetMs: Math.max(
      0,
      Math.min(60_000, envNumber("AI_NARRATIVE_ENHANCE_BUDGET_MS", 4_500))
    ),
    streamModerationThrottleMs: Math.max(
      0,
      Math.min(2000, envNumber("AI_STREAM_MODERATION_THROTTLE_MS", 0))
    ),
    loreRetrievalBudgetMs: clamp(envNumber("AI_LORE_RETRIEVAL_BUDGET_MS", 600), 0, 5000),
    offlineFailFast: envBoolean("AI_OFFLINE_FAILFAST", true),
    offlineAllowMainFallback: envBoolean("AI_OFFLINE_ALLOW_MAIN_FALLBACK", false),
    offlineAffectsProviderCircuit: envBoolean("AI_OFFLINE_AFFECTS_PROVIDER_CIRCUIT", false),
    offlineBudgetProfile: envEnum("AI_OFFLINE_BUDGET_PROFILE", ["default", "peak"] as const, "default"),
  };
}

/** True when gateway URL, key, and main model name are configured (minimum for player chat). */
export function anyAiProviderConfigured(): boolean {
  if (process.env.VC_FORCE_AI_KEYS_MISSING === "1" || process.env.AI_FORCE_KEYS_MISSING === "1") {
    return false;
  }
  const e = resolveAiEnv();
  if (e.gatewayProvider === "mock") return true;
  return (
    e.gatewayApiKey.length > 0 &&
    e.gatewayBaseUrl.length > 0 &&
    e.modelsByRole.main.length > 0
  );
}

/** 主对话网关 URL、密钥、主逻辑角色在 one-api 侧的模型 id（opaque 字符串）。 */
export function resolveGatewayPrimaryBinding(): {
  apiUrl: string;
  apiKey: string;
  model: string;
} {
  const e = resolveAiEnv();
  return {
    apiUrl: e.gatewayBaseUrl,
    apiKey: e.gatewayApiKey,
    model: e.modelsByRole.main,
  };
}

export type EmbeddingProvider = "openai_compatible" | "ark_multimodal";

/**
 * T4 后续（2026-07）：这个账号上唯一未停用的向量化模型是火山方舟的多模态向量化模型
 * （doubao-embedding-vision / Seed-1.6-Embedding），它走独立的 `POST /api/v3/embeddings/multimodal`
 * 端点、独立请求体（`input` 为 `[{type:"text",text}]` 数组）和独立响应结构，不是标准 OpenAI 兼容
 * `/v1/embeddings`。已用真实凭证探测确认 one-api 网关未实现转发这条非标准路径（网关对该路径直接
 * 返回路由层 404 "Invalid URL"，不是鉴权错误）。
 *
 * 这是本仓库对"所有 AI 调用走 one-api"约定的一次有意识例外，范围严格限定在这一条离线 embedding
 * 路径（`embedText.ts`，只服务 backfill worker，不进 `/api/chat` 首包），需要独立的
 * `ARK_EMBEDDING_API_KEY`（鉴权域不同，不能复用 `AI_GATEWAY_API_KEY`）。默认仍是
 * `openai_compatible`（走 one-api 网关），只有显式设置 `AI_EMBEDDING_PROVIDER=ark_multimodal`
 * 才切到直连火山方舟这条例外路径。
 */
function resolveEmbeddingProvider(): EmbeddingProvider {
  const raw = (envRaw("AI_EMBEDDING_PROVIDER") ?? "").trim().toLowerCase();
  return raw === "ark_multimodal" ? "ark_multimodal" : "openai_compatible";
}

/**
 * T4（2026-07，世界知识向量检索）：embeddings 绑定。
 *
 * 默认路径（`openai_compatible`）与 `resolveGatewayPrimaryBinding()` 同一套约定——不在业务
 * 代码里写死厂商细节，模型选型通过 `AI_MODEL_EMBEDDING`（opaque 字符串，由 one-api 侧的 channel
 * 配置决定实际打到哪个厂商/模型）解析，鉴权复用 `AI_GATEWAY_API_KEY`。
 *
 * `ark_multimodal` 分支是上面注释里说明的架构例外，直连火山方舟，见 `resolveEmbeddingProvider()`。
 *
 * `dimension` 对应 `world_knowledge_chunks.embedding_vector` 的 pgvector 列宽度
 * （见 `src/db/ensureSchema.ts`）。如果实际模型输出维度与此不同，调用方（`embedText.ts`）
 * 需要自行处理不匹配，不静默截断/补零。
 */
export function resolveEmbeddingBinding(): {
  apiUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
  provider: EmbeddingProvider;
  configured: boolean;
} {
  const gatewayProvider = resolveAiProviderId();
  const dimension = Math.max(1, envNumber("AI_EMBEDDING_DIMENSION", 1024));
  const model = (envRaw("AI_MODEL_EMBEDDING") ?? "").trim();

  if (gatewayProvider === "mock") {
    return { apiUrl: "mock://embeddings", apiKey: "mock-key", model, dimension, provider: "openai_compatible", configured: true };
  }

  const provider = resolveEmbeddingProvider();
  if (provider === "ark_multimodal") {
    const base = (envRaw("ARK_EMBEDDING_BASE_URL") ?? "https://ark.cn-beijing.volces.com").trim().replace(/\/+$/, "");
    const apiUrl = base.length > 0 ? `${base}/api/v3/embeddings/multimodal` : "";
    const apiKey = (envRaw("ARK_EMBEDDING_API_KEY") ?? "").trim();
    const configured = apiUrl.length > 0 && apiKey.length > 0 && model.length > 0;
    return { apiUrl, apiKey, model, dimension, provider, configured };
  }

  const apiUrl = resolveGatewayEmbeddingsUrl();
  const apiKey = (envRaw("AI_GATEWAY_API_KEY") ?? "").trim();
  const configured = apiUrl.length > 0 && apiKey.length > 0 && model.length > 0;
  return { apiUrl, apiKey, model, dimension, provider, configured };
}

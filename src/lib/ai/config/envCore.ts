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
  if (!envBoolean("AI_UPSTREAM_MERGE_EXTRA_BODY", false)) return undefined;
  return resolveExtraBodyJson("AI_UPSTREAM_EXTRA_BODY_JSON");
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
 * Runtime transport kind. Real URL, Key and model truth comes from the managed
 * database snapshot; only deterministic mock remains environment-driven.
 */
export type AiGatewayProviderId = "openai_compatible" | "mock";

export interface ResolvedAiEnv {
  gatewayProvider: AiGatewayProviderId;
  /** Resolved chat/completions URL (includes /v1/chat/completions when base is root). */
  gatewayBaseUrl: string;
  gatewayApiKey: string;
  /** Optional task-scoped model for the realtime player/gameplay lane only. */
  playerGameplayModel: string;
  /** Compatibility role names; real upstream models come from managed bindings. */
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
  /** Parsed AI_UPSTREAM_EXTRA_BODY_JSON when AI_UPSTREAM_MERGE_EXTRA_BODY=1. */
  gatewayExtraBody?: Record<string, unknown>;
  /** Parsed AI_PLAYER_CHAT_EXTRA_BODY_JSON when AI_PLAYER_CHAT_MERGE_EXTRA_BODY=1. */
  playerChatExtraBody?: Record<string, unknown>;
  /**
   * Wall-clock cap to wait for control preflight before treating as unavailable (same as API failure).
   * 0 = wait for full upstream timeout (legacy).
   */
  controlPreflightBudgetMs: number;
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

export function resolveAiProviderId(): AiGatewayProviderId {
  const raw = (envRaw("AI_PROVIDER") ?? "").trim().toLowerCase();
  if (raw === "mock") return "mock";
  return "openai_compatible";
}

export function isMockAiProviderEnv(): boolean {
  return resolveAiProviderId() === "mock";
}

function readModelForRole(role: AiLogicalRole): string {
  return isMockAiProviderEnv() ? `mock-${role}` : "";
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
  const gatewayBaseUrl = gatewayProvider === "mock" ? "mock://chat/completions" : "";
  const gatewayApiKey = gatewayProvider === "mock" ? "mock-key" : "";

  const modelsByRole = {} as Record<AiLogicalRole, string>;
  for (const r of AI_LOGICAL_ROLES) {
    modelsByRole[r] = readModelForRole(r);
  }
  const playerChatTimeoutsV2 = envBoolean("AI_PLAYER_CHAT_TIMEOUTS_V2", true);

  return {
    gatewayProvider,
    gatewayBaseUrl,
    gatewayApiKey,
    playerGameplayModel: "",
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
    playerChatStreamIncludeUsage: envBoolean("AI_PLAYER_CHAT_STREAM_INCLUDE_USAGE", false),
    playerChatFastLaneRelaxResponseFormat: envBoolean("AI_PLAYER_CHAT_FASTLANE_RELAX_RESPONSE_FORMAT", false),
    playerChatMaxRoleCandidates: Math.max(0, Math.min(6, envNumber("AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES", 2))),
    playerChatMaxRetries: (() => {
      const override = envNumber("AI_PLAYER_CHAT_MAX_RETRIES", NaN);
      const base = Number.isFinite(override) ? override : envNumber("AI_MAX_RETRIES", NaN);
      const resolved = Number.isFinite(base) ? base : envNumber("AI_RETRY_COUNT", 2);
      // Conservative cap for player-facing TTFT: allow explicit override, but never exceed 4.
      return Math.max(0, Math.min(4, resolved));
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
      return Math.max(0, Math.min(3, resolved));
    })(),
    // Keep a named opt-out for providers without json_object support, but do
    // not make malformed control output the default for player-facing checks.
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
    streamModerationThrottleMs: Math.max(
      0,
      Math.min(2000, envNumber("AI_STREAM_MODERATION_THROTTLE_MS", 0))
    ),
    loreRetrievalBudgetMs: Math.max(0, Math.min(5000, envNumber("AI_LORE_RETRIEVAL_BUDGET_MS", 600))),
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
  return false;
}

/** Legacy-shaped binding used only by mock/test compatibility consumers. */
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

/**
 * @deprecated 使用 `resolveGatewayPrimaryBinding`（名称历史原因，与厂商无关）。
 */
export function resolveDeepSeekLegacyConfig(): { apiUrl: string; apiKey: string; model: string } {
  return resolveGatewayPrimaryBinding();
}

export type EmbeddingProvider = "openai_compatible" | "ark_multimodal";

/**
 * T4（2026-07，世界知识向量检索）：embeddings 绑定。
 *
 * 真实绑定由后台 AI 管理快照提供；这里仅保留 mock/test 兼容返回形状。
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
  const model = gatewayProvider === "mock" ? "mock-embedding" : "";

  if (gatewayProvider === "mock") {
    return { apiUrl: "mock://embeddings", apiKey: "mock-key", model, dimension, provider: "openai_compatible", configured: true };
  }

  return { apiUrl: "", apiKey: "", model: "", dimension, provider: "openai_compatible", configured: false };
}

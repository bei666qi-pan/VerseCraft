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

function resolveGatewayExtraBody(): Record<string, unknown> | undefined {
  if (!envBoolean("AI_GATEWAY_MERGE_EXTRA_BODY", false)) return undefined;
  const raw = envRaw("AI_GATEWAY_EXTRA_BODY_JSON")?.trim();
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

export type AiGatewayProviderId = "oneapi";

export interface ResolvedAiEnv {
  gatewayProvider: AiGatewayProviderId;
  /** Resolved chat/completions URL (includes /v1/chat/completions when base is root). */
  gatewayBaseUrl: string;
  gatewayApiKey: string;
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
  /** Keep enhancement pipeline compatible but disabled by default in Phase 1. */
  enableNarrativeEnhancement: boolean;
  /**
   * PLAYER_CHAT: whether to request stream_options.include_usage from upstream.
   * Disabled can reduce vendor overhead and payload size; usage still best-effort via fallback estimation.
   */
  playerChatStreamIncludeUsage: boolean;
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
  /** Online short JSON tasks: max retries (default 0 to avoid TTFT amplification). */
  onlineShortJsonMaxRetries: number;
  /**
   * Online short JSON tasks: when true, do not send response_format=json_object to upstream,
   * but still sanitize + validate JSON locally.
   */
  onlineShortJsonRelaxResponseFormat: boolean;
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

/** @deprecated Use DEFAULT_PLAYER_ROLE_CHAIN */
export const DEFAULT_PLAYER_CHAIN = DEFAULT_PLAYER_ROLE_CHAIN;

function resolveGatewayChatCompletionsUrl(): string {
  const raw = envRaw("AI_GATEWAY_BASE_URL")?.trim() ?? "";
  if (!raw) return "";
  const normalized = raw.replace(/\/+$/, "");
  if (normalized.toLowerCase().endsWith("/chat/completions")) {
    return normalized;
  }
  return `${normalized}/v1/chat/completions`;
}

function readModelForRole(role: AiLogicalRole): string {
  const key =
    role === "main"
      ? "AI_MODEL_MAIN"
      : role === "control"
        ? "AI_MODEL_CONTROL"
        : role === "enhance"
          ? "AI_MODEL_ENHANCE"
          : "AI_MODEL_REASONER";
  const direct = (envRaw(key) ?? "").trim();
  if (role === "enhance") {
    // Phase 1: physical deployment keeps 3 model names. When AI_MODEL_ENHANCE is unset,
    // transparently map enhance-role traffic to main model deployment.
    if (direct.length > 0) return direct;
    return (envRaw("AI_MODEL_MAIN") ?? "").trim();
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

  const gatewayProvider = envEnum("AI_GATEWAY_PROVIDER", ["oneapi"] as const, "oneapi");
  const gatewayBaseUrl = resolveGatewayChatCompletionsUrl();
  const gatewayApiKey = (envRaw("AI_GATEWAY_API_KEY") ?? "").trim();

  const modelsByRole = {} as Record<AiLogicalRole, string>;
  for (const r of AI_LOGICAL_ROLES) {
    modelsByRole[r] = readModelForRole(r);
  }

  return {
    gatewayProvider,
    gatewayBaseUrl,
    gatewayApiKey,
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
    enableNarrativeEnhancement: envBoolean("AI_ENABLE_NARRATIVE_ENHANCEMENT", false),
    playerChatStreamIncludeUsage: envBoolean("AI_PLAYER_CHAT_STREAM_INCLUDE_USAGE", true),
    playerChatMaxRoleCandidates: Math.max(0, Math.min(6, envNumber("AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES", 2))),
    playerChatMaxRetries: (() => {
      const override = envNumber("AI_PLAYER_CHAT_MAX_RETRIES", NaN);
      const base = Number.isFinite(override) ? override : envNumber("AI_MAX_RETRIES", NaN);
      const resolved = Number.isFinite(base) ? base : envNumber("AI_RETRY_COUNT", 2);
      // Conservative cap for player-facing TTFT: allow explicit override, but never exceed 4.
      return Math.max(0, Math.min(4, resolved));
    })(),
    onlineShortJsonMaxRetries: (() => {
      const override = envNumber("AI_ONLINE_SHORT_JSON_MAX_RETRIES", NaN);
      // Default to 0 (fast fail), but allow explicit override.
      const resolved = Number.isFinite(override) ? override : 0;
      return Math.max(0, Math.min(3, resolved));
    })(),
    onlineShortJsonRelaxResponseFormat: envBoolean("AI_ONLINE_SHORT_JSON_RELAX_RESPONSE_FORMAT", true),
    onlineShortJsonDisableMainFallback: envBoolean("AI_ONLINE_SHORT_JSON_DISABLE_MAIN_FALLBACK", true),
    playerChatAggressiveFailover: envBoolean("AI_PLAYER_CHAT_AGGRESSIVE_FAILOVER", true),
    playerChatFastLaneZeroRetry: envBoolean("AI_PLAYER_CHAT_FASTLANE_ZERO_RETRY", true),
    playerChatFailFastOnAuth: envBoolean("AI_PLAYER_CHAT_FAILFAST_AUTH", true),
    playerChatFailFastOnRateLimit: envBoolean("AI_PLAYER_CHAT_FAILFAST_RATELIMIT", true),
    onlineShortJsonRetryHardCap1: envBoolean("AI_ONLINE_SHORT_JSON_RETRY_HARDCAP_1", true),
    gatewayExtraBody: resolveGatewayExtraBody(),
    controlPreflightBudgetMs: Math.max(
      0,
      Math.min(10_000, envNumber("AI_CONTROL_PREFLIGHT_BUDGET_MS", 0))
    ),
    narrativeEnhanceBudgetMs: Math.max(
      0,
      Math.min(60_000, envNumber("AI_NARRATIVE_ENHANCE_BUDGET_MS", 0))
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
  const e = resolveAiEnv();
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

/**
 * @deprecated 使用 `resolveGatewayPrimaryBinding`（名称历史原因，与厂商无关）。
 */
export function resolveDeepSeekLegacyConfig(): { apiUrl: string; apiKey: string; model: string } {
  return resolveGatewayPrimaryBinding();
}

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
  return (envRaw(key) ?? "").trim();
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

export function resolveAiEnv(): ResolvedAiEnv {
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

/**
 * @deprecated Call sites should use resolveAiEnv(). Narrow legacy shape for admin/diagnostics only.
 */
export function resolveDeepSeekLegacyConfig(): { apiUrl: string; apiKey: string; model: string } {
  const e = resolveAiEnv();
  return {
    apiUrl: e.gatewayBaseUrl,
    apiKey: e.gatewayApiKey,
    model: e.modelsByRole.main,
  };
}

import "server-only";

import { resolveDeepSeekLegacyConfig } from "@/lib/ai/config/env";

type EnvValue = string | undefined;

function readEnv(name: string): EnvValue {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnvAsNumber(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`[env] Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: readEnv("NODE_ENV") ?? "development",
  databaseUrl: ensureEnv("DATABASE_URL").replace(/^['"]|['"]$/g, ""),
  redisUrl: readEnv("REDIS_URL"),
  authSecret: ensureEnv("AUTH_SECRET"),
  authTrustHost: readEnv("AUTH_TRUST_HOST") ?? "true",
  adminPassword: readEnv("ADMIN_PASSWORD"),
  altchaHmacKey: readEnv("ALTCHA_HMAC_KEY"),
  runtimeSchemaEnsure: readEnv("RUNTIME_SCHEMA_ENSURE") ?? "1",
  migrateOnBoot: readEnv("MIGRATE_ON_BOOT") ?? "1",
  dailyTokenLimit: readEnvAsNumber("DAILY_TOKEN_LIMIT", 50_000),
  dailyActionLimit: readEnvAsNumber("DAILY_ACTION_LIMIT", 200),
  securityModerationEnabled: (readEnv("MODERATION_ENABLED") ?? readEnv("SECURITY_MODERATION_ENABLED") ?? "true") === "true",
  securityModerationProvider: readEnv("MODERATION_PROVIDER") ?? readEnv("SECURITY_MODERATION_PROVIDER") ?? "auto",
  securityModerationTimeoutMs: readEnvAsNumber("MODERATION_TIMEOUT_MS", readEnvAsNumber("SECURITY_MODERATION_TIMEOUT_MS", 3000)),
  securityModerationFailOpen: (readEnv("MODERATION_FAIL_OPEN") ?? readEnv("SECURITY_MODERATION_FAIL_OPEN") ?? "true") === "true",
  securityAuditLogLevel: readEnv("SECURITY_LOG_LEVEL") ?? readEnv("SECURITY_AUDIT_LOG_LEVEL") ?? "warn",
  securityIpLimitPerMinute: readEnvAsNumber("SECURITY_IP_LIMIT_PER_MINUTE", 30),
  securitySessionLimitPerMinute: readEnvAsNumber("SECURITY_SESSION_LIMIT_PER_MINUTE", 24),
  securityUserLimitPerMinute: readEnvAsNumber("SECURITY_USER_LIMIT_PER_MINUTE", 20),
  securityHighRiskStrikeThreshold: readEnvAsNumber("SECURITY_HIGH_RISK_STRIKE_THRESHOLD", 3),
  securityTempBlockSeconds: readEnvAsNumber("SECURITY_TEMP_BLOCK_SECONDS", 600),
};

export type DeepSeekConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
};

/** Delegates to unified AI env (whitelist + defaults). */
export function resolveDeepSeekConfig(): DeepSeekConfig {
  const x = resolveDeepSeekLegacyConfig();
  return { apiUrl: x.apiUrl, apiKey: x.apiKey, model: x.model };
}

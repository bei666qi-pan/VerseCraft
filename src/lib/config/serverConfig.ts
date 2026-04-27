// src/lib/config/serverConfig.ts
import "server-only";

import { envBoolean, envNumber, envRaw, envRawFirst } from "@/lib/config/envRaw";
import { assertPreviewEnvironmentSafe } from "@/lib/config/previewGuards";
import {
  EnvValidationError,
  normalizeDatabaseUrl,
  validateAuthSecretLength,
  validatePostgresDatabaseUrl,
} from "@/lib/config/validateCriticalEnv";

export { EnvValidationError } from "@/lib/config/validateCriticalEnv";

function requireNonEmpty(name: string): string {
  const v = envRaw(name);
  if (!v) {
    throw new EnvValidationError(
      `Missing required environment variable: ${name}. Set it in .env.local (local) or Coolify Environment Variables (deploy).`
    );
  }
  return v;
}

export type SecurityAuditLogLevel = "silent" | "warn" | "info" | "debug";

export interface ServerConfig {
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string | undefined;
  authSecret: string;
  authTrustHost: string;
  adminPassword: string | undefined;
  altchaHmacKey: string | undefined;
  /** HMAC secret for /api/audit client signatures. */
  auditHmacSecret: string;
  runtimeSchemaEnsure: string;
  migrateOnBoot: string;
  dailyTokenLimit: number;
  dailyActionLimit: number;
  securityModerationEnabled: boolean;
  securityModerationProvider: string;
  securityModerationTimeoutMs: number;
  securityModerationFailOpen: boolean;
  securityAuditLogLevel: SecurityAuditLogLevel;
  securityIpLimitPerMinute: number;
  securitySessionLimitPerMinute: number;
  securityUserLimitPerMinute: number;
  securityHighRiskStrikeThreshold: number;
  securityTempBlockSeconds: number;
}

function loadServerConfig(): ServerConfig {
  const nodeEnv = envRaw("NODE_ENV") ?? "development";
  const databaseUrl = normalizeDatabaseUrl(requireNonEmpty("DATABASE_URL"));
  validatePostgresDatabaseUrl(databaseUrl);
  assertPreviewEnvironmentSafe(databaseUrl);

  const authSecret = requireNonEmpty("AUTH_SECRET");
  validateAuthSecretLength(authSecret);

  const auditHmacSecret =
    envRawFirst(["AUDIT_HMAC_SECRET", "SECRET_KEY"]) ?? authSecret;

  const moderationEnabled = envBoolean(
    "MODERATION_ENABLED",
    envBoolean("SECURITY_MODERATION_ENABLED", true)
  );
  const moderationProvider =
    envRawFirst(["MODERATION_PROVIDER", "SECURITY_MODERATION_PROVIDER"]) ?? "auto";
  const modMs = envNumber("MODERATION_TIMEOUT_MS", NaN);
  const moderationTimeoutMs = Number.isFinite(modMs)
    ? modMs
    : envNumber("SECURITY_MODERATION_TIMEOUT_MS", 3000);
  const moderationFailOpen = envBoolean(
    "MODERATION_FAIL_OPEN",
    envBoolean("SECURITY_MODERATION_FAIL_OPEN", true)
  );
  const levelRaw = envRawFirst(["SECURITY_LOG_LEVEL", "SECURITY_AUDIT_LOG_LEVEL"])?.toLowerCase();
  const auditLevel: SecurityAuditLogLevel =
    levelRaw === "silent" || levelRaw === "info" || levelRaw === "debug" || levelRaw === "warn"
      ? levelRaw
      : "warn";

  return {
    nodeEnv,
    databaseUrl,
    redisUrl: envRaw("REDIS_URL"),
    authSecret,
    authTrustHost: envRaw("AUTH_TRUST_HOST") ?? "true",
    adminPassword: envRaw("ADMIN_PASSWORD"),
    altchaHmacKey: envRaw("ALTCHA_HMAC_KEY"),
    auditHmacSecret,
    runtimeSchemaEnsure: envRaw("RUNTIME_SCHEMA_ENSURE") ?? "1",
    migrateOnBoot: envRaw("MIGRATE_ON_BOOT") ?? "1",
    dailyTokenLimit: envNumber("DAILY_TOKEN_LIMIT", 50_000),
    dailyActionLimit: envNumber("DAILY_ACTION_LIMIT", 200),
    securityModerationEnabled: moderationEnabled,
    securityModerationProvider: moderationProvider,
    securityModerationTimeoutMs: moderationTimeoutMs,
    securityModerationFailOpen: moderationFailOpen,
    securityAuditLogLevel: auditLevel,
    securityIpLimitPerMinute: envNumber("SECURITY_IP_LIMIT_PER_MINUTE", 30),
    securitySessionLimitPerMinute: envNumber("SECURITY_SESSION_LIMIT_PER_MINUTE", 24),
    securityUserLimitPerMinute: envNumber("SECURITY_USER_LIMIT_PER_MINUTE", 20),
    securityHighRiskStrikeThreshold: envNumber("SECURITY_HIGH_RISK_STRIKE_THRESHOLD", 3),
    securityTempBlockSeconds: envNumber("SECURITY_TEMP_BLOCK_SECONDS", 600),
  };
}

/** Parsed once per process; throws before handling traffic if critical vars are missing. */
export const serverConfig: ServerConfig = loadServerConfig();

export function assertServerConfigLoaded(): void {
  void serverConfig;
}

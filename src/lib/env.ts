import "server-only";

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
  volcengineSafetyEndpoint: readEnv("VOLCENGINE_SAFETY_ENDPOINT"),
  volcengineSafetyApiKey: readEnv("VOLCENGINE_SAFETY_API_KEY"),
  volcengineSafetyApiSecret: readEnv("VOLCENGINE_SAFETY_API_SECRET"),
  volcengineSafetyAppId: readEnv("VOLCENGINE_SAFETY_APP_ID"),
  volcengineSafetyRegion: readEnv("VOLCENGINE_SAFETY_REGION"),
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

export function resolveDeepSeekConfig(): DeepSeekConfig {
  const apiUrl =
    readEnv("VOLCENGINE_DEEPSEEK_API_URL") ??
    readEnv("ARK_API_URL") ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

  const apiKey = readEnv("VOLCENGINE_API_KEY") ?? readEnv("ARK_API_KEY") ?? readEnv("DEEPSEEK_API_KEY") ?? "";

  const model =
    readEnv("VOLCENGINE_ENDPOINT_ID") ??
    readEnv("ARK_ENDPOINT_ID") ??
    readEnv("VOLCENGINE_DEEPSEEK_MODEL") ??
    readEnv("ARK_MODEL") ??
    readEnv("DEEPSEEK_MODEL") ??
    "deepseek-v3.2";

  return { apiUrl, apiKey, model };
}

import type { LangfuseConfig } from "./types";

export type LangfusePreflightState = "disabled" | "misconfigured" | "ready";

export type LangfusePreflightResult = {
  state: LangfusePreflightState;
  ready: boolean;
  baseUrl: string;
  environment: string;
  sampleRate: number;
  issues: string[];
};

const DEFAULT_HASH_SALT = "versecraft-langfuse-default";

export function evaluateLangfusePreflight(
  config: LangfuseConfig,
  nodeEnv = process.env.NODE_ENV ?? "development"
): LangfusePreflightResult {
  if (!config.enabled) {
    return {
      state: "disabled",
      ready: false,
      baseUrl: config.baseUrl,
      environment: config.environment,
      sampleRate: config.sampleRate,
      issues: ["VERSECRAFT_ENABLE_LANGFUSE is disabled"],
    };
  }

  const issues: string[] = [];
  if (!config.publicKey) issues.push("LANGFUSE_PUBLIC_KEY is missing");
  if (!config.secretKey) issues.push("LANGFUSE_SECRET_KEY is missing");
  try {
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      issues.push("LANGFUSE_BASE_URL must use HTTPS outside localhost");
    }
  } catch {
    issues.push("LANGFUSE_BASE_URL is invalid");
  }
  if (!(config.sampleRate > 0 && config.sampleRate <= 1)) {
    issues.push("VERSECRAFT_LANGFUSE_SAMPLE_RATE must be > 0 and <= 1 when enabled");
  }
  if (nodeEnv === "production" && config.hashSalt === DEFAULT_HASH_SALT) {
    issues.push("VERSECRAFT_LANGFUSE_HASH_SALT must be replaced in production");
  }

  return {
    state: issues.length === 0 ? "ready" : "misconfigured",
    ready: issues.length === 0,
    baseUrl: config.baseUrl,
    environment: config.environment,
    sampleRate: config.sampleRate,
    issues,
  };
}

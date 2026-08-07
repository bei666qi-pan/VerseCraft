// src/lib/observability/langfuse/config.ts

import type { LangfuseConfig, PromptSourceMode } from "./types";

function envStr(key: string): string | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  return v.trim();
}

function envBool(key: string, fallback: boolean): boolean {
  const v = envStr(key);
  if (v === undefined) return fallback;
  return v !== "0" && v !== "false" && v !== "no";
}

function envNum(key: string, fallback: number): number {
  const v = envStr(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function promptSource(raw: string | undefined): PromptSourceMode {
  if (raw === "remote") return "remote";
  if (raw === "shadow") return "shadow";
  return "local";
}

/**
 * Load Langfuse configuration from environment variables.
 * Uses Langfuse canonical env names (LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL)
 * plus VerseCraft-specific feature flags (VERSECRAFT_ENABLE_LANGFUSE, etc.).
 */
export function loadLangfuseConfig(): LangfuseConfig {
  const enabled = envBool("VERSECRAFT_ENABLE_LANGFUSE", false);
  const publicKey = envStr("LANGFUSE_PUBLIC_KEY");
  const secretKey = envStr("LANGFUSE_SECRET_KEY");
  const baseUrl = envStr("LANGFUSE_BASE_URL") ?? "https://cloud.langfuse.com";
  const environment = envStr("LANGFUSE_TRACING_ENVIRONMENT") ??
    envStr("NODE_ENV") ?? "development";
  const release = envStr("LANGFUSE_RELEASE") ??
    envStr("BUILD_ID") ??
    envStr("NEXT_PUBLIC_BUILD_ID");

  const nodeEnv = envStr("NODE_ENV") ?? "development";
  const defaultSampleRate = nodeEnv === "production" ? 0.1 : nodeEnv === "staging" ? 1 : 0;
  const sampleRate = envNum("VERSECRAFT_LANGFUSE_SAMPLE_RATE", defaultSampleRate);

  const captureContent = envBool("VERSECRAFT_LANGFUSE_CAPTURE_CONTENT", false);
  const promptSourceVal = promptSource(envStr("VERSECRAFT_LANGFUSE_PROMPT_SOURCE"));

  const flushTimeoutMs = envNum("VERSECRAFT_LANGFUSE_FLUSH_TIMEOUT_MS", 5000);

  const hashSalt = envStr("VERSECRAFT_LANGFUSE_HASH_SALT") ?? "versecraft-langfuse-default";

  // Read-side config (independent of write-side `enabled`)
  const enableRead = envBool("VERSECRAFT_ENABLE_LANGFUSE_READ", false);
  const readTimeoutMs = envNum("VERSECRAFT_LANGFUSE_READ_TIMEOUT_MS", 5000);

  return {
    enabled,
    publicKey,
    secretKey,
    baseUrl,
    environment,
    release,
    sampleRate,
    captureContent,
    promptSource: promptSourceVal,
    flushTimeoutMs,
    hashSalt,
    enableRead,
    readTimeoutMs,
  };
}

/** Lazily initialized singleton. */
let _config: LangfuseConfig | null = null;

export function getLangfuseConfig(): LangfuseConfig {
  if (!_config) {
    _config = loadLangfuseConfig();
  }
  return _config;
}

/** Check if Langfuse is effectively usable: enabled flag + both keys present. */
export function isLangfuseReady(): boolean {
  const cfg = getLangfuseConfig();
  return cfg.enabled && !!cfg.publicKey && !!cfg.secretKey;
}

/** Check if Langfuse read (Dashboard) is enabled. Independent of write-side. */
export function isLangfuseReadEnabled(): boolean {
  const cfg = getLangfuseConfig();
  return cfg.enableRead && !!cfg.publicKey && !!cfg.secretKey;
}

/** Reset cached config (for testing). */
export function resetLangfuseConfig(): void {
  _config = null;
}

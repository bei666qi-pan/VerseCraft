// src/lib/observability/langfuse/privacy.ts

import { createHmac } from "node:crypto";
import { getLangfuseConfig } from "./config";

/**
 * Hash an identity string (userId, sessionId) with HMAC-SHA256 using the configured salt.
 * This produces a non-reversible, non-enumerable identifier suitable for Langfuse tracing
 * without leaking raw user identifiers.
 */
export function hashIdentity(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const cfg = getLangfuseConfig();
  const hmac = createHmac("sha256", cfg.hashSalt);
  hmac.update(value);
  return hmac.digest("hex").slice(0, 32);
}

/**
 * Content that must NEVER be sent to Langfuse.
 * Returns true if the key or value contains sensitive data.
 */
const REDACTED_CONTENT_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /credential/i,
];

/**
 * Check if an attribute key would leak sensitive data.
 */
export function isSensitiveKey(key: string): boolean {
  return REDACTED_CONTENT_PATTERNS.some((p) => p.test(key));
}

/**
 * Strip sensitive fields from an attribute record.
 * Returns a new object with only safe keys.
 */
export function sanitizeAttributes(
  attrs: Record<string, string | number | boolean>
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!isSensitiveKey(k)) {
      safe[k] = v;
    }
  }
  return safe;
}

/**
 * Truncate a string value for safe logging.
 * Never logs raw content longer than the limit.
 */
export function safeString(value: string | undefined | null, maxLen = 200): string | undefined {
  if (!value) return undefined;
  return value.slice(0, maxLen);
}

/**
 * Hash content for comparison without storing the content itself.
 */
export function hashContent(value: string): string {
  const cfg = getLangfuseConfig();
  const hmac = createHmac("sha256", cfg.hashSalt);
  hmac.update(value);
  return hmac.digest("hex").slice(0, 16);
}

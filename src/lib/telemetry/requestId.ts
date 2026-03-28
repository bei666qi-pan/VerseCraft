export const VERSECRAFT_REQUEST_ID_HEADER = "x-versecraft-request-id";
export const VERSECRAFT_REQUEST_ID_RESPONSE_HEADER = "x-versecraft-request-id";

const SAFE_ID_RE = /^[a-z0-9][a-z0-9_\-:.]{8,80}$/i;

export function isSafeVerseCraftRequestId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  return SAFE_ID_RE.test(s);
}

/**
 * Browser-safe request id.
 * - No PII, no session/user info
 * - Stable prefix for log filtering
 */
export function createVerseCraftRequestId(prefix = "chat"): string {
  const t = Date.now().toString(36);
  const rand = (() => {
    try {
      const buf = new Uint8Array(10);
      crypto.getRandomValues(buf);
      return Array.from(buf)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 14);
    } catch {
      return Math.random().toString(16).slice(2, 16);
    }
  })();
  const id = `vc_${prefix}_${t}_${rand}`;
  return id.length <= 90 ? id : id.slice(0, 90);
}


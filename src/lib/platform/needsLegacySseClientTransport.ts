/**
 * Some in-app browsers (WeChat/Quark/Baidu/UC, etc.) expose a broken or null
 * `Response.body` for streamed `fetch`, while same-origin XHR `responseText`
 * still receives the full SSE document.
 */

/** Lowercase substrings; keep specific to avoid matching normal Chrome Mobile. */
export const LEGACY_SSE_TRANSPORT_UA_MARKERS = [
  "micromessenger",
  "qq/",
  "quark",
  "baiduboxapp",
  "baidubrowser",
  "ucbrowser",
  "miuibrowser",
] as const;

export function needsLegacySseClientTransportFromUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) return false;
  for (const marker of LEGACY_SSE_TRANSPORT_UA_MARKERS) {
    if (ua.includes(marker)) return true;
  }
  return false;
}

/**
 * Returns true when the current browser should avoid `fetch` streaming and use
 * XHR to read the full SSE text in one response.
 */
export function needsLegacySseClientTransport(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof ReadableStream === "undefined") return true;
  return needsLegacySseClientTransportFromUserAgent(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

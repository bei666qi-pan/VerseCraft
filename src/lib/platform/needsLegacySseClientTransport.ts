/**
 * Some in-app browsers (WeChat/Quark/Baidu/UC/QQ, etc.) expose a broken or null
 * `Response.body` for streamed `fetch`, while same-origin XHR `responseText`
 * still receives the full SSE document.
 */

/** Lowercase substrings; keep specific to avoid matching normal Chrome Mobile. */
export const LEGACY_SSE_TRANSPORT_UA_MARKERS = [
  "micromessenger",
  "wxwork",
  "qq/",
  "mqqbrowser",
  "qqbrowser",
  " qq",
  "qbcore",
  "tbs/",
  "quark",
  "baiduboxapp",
  "baiduapp",
  "baiduhd",
  "baidubrowser",
  "bdbrowser",
  "swan/",
  "ucbrowser",
  "ucweb/",
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
 * Low-entropy Client Hints: Chromium exposes `navigator.userAgentData.brands` synchronously.
 * Some shells spoof a generic Chrome UA but still report a recognizable brand here.
 */
export function needsLegacySseClientTransportFromUserAgentDataBrands(
  brands: Iterable<{ brand?: string }> | null | undefined
): boolean {
  if (!brands) return false;
  for (const entry of brands) {
    const b = String(entry?.brand ?? "").toLowerCase();
    if (!b) continue;
    if (b.includes("micromessenger") || b.includes("wechat")) return true;
    if (b.includes("quark")) return true;
    if (b.includes("baidu") || b.includes("bdbrowser")) return true;
    if (b.includes("ucbrowser") || b.includes("ucweb")) return true;
    if (b.includes("miuibrowser")) return true;
    if (b.includes("mqqbrowser") || b.includes("qbcore")) return true;
    if (b.includes("qq") && b.includes("browser")) return true;
  }
  return false;
}

export function needsLegacySseClientTransportFromHighEntropyUserAgentData(data: {
  brands?: readonly { brand?: string }[] | null | undefined;
  fullVersionList?: readonly { brand?: string }[] | null | undefined;
}): boolean {
  return (
    needsLegacySseClientTransportFromUserAgentDataBrands(data.brands) ||
    needsLegacySseClientTransportFromUserAgentDataBrands(data.fullVersionList)
  );
}

/**
 * Returns true when the current browser should avoid `fetch` streaming and use
 * XHR to read the full SSE text in one response.
 */
export function needsLegacySseClientTransport(): boolean {
  if (typeof window === "undefined") return false;
  // No ReadableStream at all → must use legacy.
  if (typeof ReadableStream === "undefined") return true;
  // AbortController missing → fetch+signal deadline won't work, use legacy.
  if (typeof AbortController === "undefined") return true;
  // Incomplete Streams API: the browser has ReadableStream but NOT WritableStream,
  // a strong signal of a partial/shallow implementation that breaks fetch body streaming.
  if (typeof WritableStream === "undefined") return true;
  // Incomplete Streams API: ReadableStream lacks the fundamental primitives.
  if (
    typeof ReadableStream.prototype.pipeTo !== "function" ||
    typeof ReadableStream.prototype.pipeThrough !== "function"
  ) {
    return true;
  }
  if (
    needsLegacySseClientTransportFromUserAgent(typeof navigator !== "undefined" ? navigator.userAgent : "")
  ) {
    return true;
  }
  const uad = typeof navigator !== "undefined" ? navigator.userAgentData : undefined;
  if (needsLegacySseClientTransportFromUserAgentDataBrands(uad?.brands)) return true;
  return false;
}

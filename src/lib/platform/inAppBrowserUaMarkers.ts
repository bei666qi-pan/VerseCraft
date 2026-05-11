/**
 * Shared in-app browser UA markers used by CSRF middleware and client-side
 * SSE transport detection. Keep the two consumers in sync through this module.
 */

/** Lowercase substrings; keep specific to avoid matching normal Chrome Mobile. */
export const IN_APP_BROWSER_UA_MARKERS = [
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

export function isInAppBrowserUserAgent(ua: string | null | undefined): boolean {
  const lower = String(ua ?? "").toLowerCase();
  if (!lower) return false;
  for (const marker of IN_APP_BROWSER_UA_MARKERS) {
    if (lower.includes(marker)) return true;
  }
  return false;
}

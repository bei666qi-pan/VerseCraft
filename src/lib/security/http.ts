import type { NextRequest, NextResponse } from "next/server";
import { isInAppBrowserUserAgent } from "@/lib/platform/inAppBrowserUaMarkers";

/**
 * Public URL as seen by the browser when behind a reverse proxy.
 * Uses X-Forwarded-Host / X-Forwarded-Proto when present (trusted edge only).
 */
export function getExpectedRequestOrigin(req: NextRequest): string {
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const xfProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()?.toLowerCase();
  const xfSsl = req.headers.get("x-forwarded-ssl");
  const hostHeader = req.headers.get("host")?.trim();

  const host = xfHost || hostHeader || "";
  if (!host) return req.nextUrl.origin;

  let protocol = xfProto;
  if (!protocol) {
    if (xfSsl === "on") protocol = "https";
    else protocol = req.nextUrl.protocol === "https:" ? "https" : "http";
  }
  return `${protocol}://${host}`;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("Content-Security-Policy", CSP);
  return response;
}

export function hasPotentialHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value);
}

export function isSuspiciousPath(pathname: string): boolean {
  return /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\\)/i.test(pathname);
}

/**
 * Extract origin (scheme://host) from a raw URL or origin string.
 * Returns null for malformed or opaque inputs including literal "null".
 */
export function normalizeOriginFromUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s === "null" || s === "undefined") return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Candidate origins derived from trusted request headers.
 * Used when a single `getExpectedRequestOrigin` is too narrow (e.g. reverse-proxy
 * with x-forwarded-proto mismatches, or in-app browsers with Origin:null).
 */
export function getCandidateRequestOrigins(req: NextRequest): string[] {
  const candidates: string[] = [];
  const nextOrigin = req.nextUrl.origin;
  if (nextOrigin) candidates.push(nextOrigin);

  const hostHeader = req.headers.get("host")?.trim();
  if (hostHeader) {
    const httpVariant = `http://${hostHeader}`;
    const httpsVariant = `https://${hostHeader}`;
    if (httpVariant !== nextOrigin) candidates.push(httpVariant);
    if (httpsVariant !== nextOrigin) candidates.push(httpsVariant);
  }

  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (xfHost && xfHost !== hostHeader) {
    // Always include both http and https variants for x-forwarded-host.
    // In-app browsers redirected from HTTP to HTTPS may send Referer with
    // the http scheme, which must still match a candidate origin.
    const httpVariant = `http://${xfHost}`;
    const httpsVariant = `https://${xfHost}`;
    if (!candidates.includes(httpVariant)) candidates.push(httpVariant);
    if (!candidates.includes(httpsVariant)) candidates.push(httpsVariant);
  }

  return candidates;
}

/**
 * Returns true when the Referer header is present and matches a candidate origin.
 * Used as a same-origin fallback when Origin is null or missing (common in in-app WebViews).
 */
export function isSameOriginReferer(req: NextRequest): boolean {
  const referer = req.headers.get("referer")?.trim();
  if (!referer) return false;
  const refererOrigin = normalizeOriginFromUrl(referer);
  if (!refererOrigin) return false;
  const candidates = getCandidateRequestOrigins(req);
  return candidates.some((c) => c === refererOrigin);
}

function hasInAppWebViewUserAgent(req: NextRequest): boolean {
  return isInAppBrowserUserAgent(req.headers.get("user-agent") ?? "");
}

function isInAppWebViewCompatibleMutatingPath(pathname: string): boolean {
  return pathname === "/api/chat" || pathname === "/api/presence/heartbeat";
}

export function isCrossSiteStateChangingRequest(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;

  // Do not short-circuit on Sec-Fetch-Site. Some in-app WebViews (Quark, Baidu,
  // WeChat/QQ shells) incorrectly send "cross-site" for same-origin XHR/fetch.
  // Origin / Referer (below) are authoritative for CSRF same-origin checks.

  const origin = req.headers.get("origin");
  // No Origin header at all → allow (browser is not sending cross-origin signal).
  if (!origin) {
    // If Origin is missing, check Referer as a complementary signal.
    // cross-site Referer → block; same-origin or no Referer → allow.
    if (isSameOriginReferer(req)) return false;
    // Only block when Referer is explicitly cross-site (not missing).
    const referer = req.headers.get("referer")?.trim();
    if (referer) {
      const refererOrigin = normalizeOriginFromUrl(referer);
      if (refererOrigin) {
        // Referer exists but doesn't match any candidate → cross-site → block.
        if (!getCandidateRequestOrigins(req).some((c) => c === refererOrigin)) return true;
      }
    }
    return false;
  }

  // Literal "null" origin: in-app WebViews (WeChat/QQ/Quark/Baidu) in opaque origins.
  // Fall back to Referer for the same-origin decision.
  if (origin === "null") {
    if (isSameOriginReferer(req)) return false;
    // If Referer is cross-site (or missing in a privacy-sensitive context), block only when
    // Referer explicitly mismatches. If Referer is missing entirely, allow as a last-resort
    // fallback (some WebViews suppress both Origin and Referer for privacy).
    const referer = req.headers.get("referer")?.trim();
    if (referer) {
      const refererOrigin = normalizeOriginFromUrl(referer);
      if (refererOrigin && !getCandidateRequestOrigins(req).some((c) => c === refererOrigin)) return true;
    }
    return false;
  }

  // Normal origin: check against the single expected origin first, then candidate set.
  const expected = getExpectedRequestOrigin(req);
  if (origin === expected) return false;
  // In some reverse-proxy setups, getExpectedRequestOrigin may resolve differently from
  // what the browser sends. Check against the broader candidate set.
  if (getCandidateRequestOrigins(req).some((c) => c === origin)) return false;

  // In some embedded WebViews, known clients may emit a synthetic `Origin` header
  // for same-site calls. If user-agent looks like known in-app WebView and Referer
  // is still same-site, treat as same-site for chat/presence heartbeat endpoints
  // to avoid false-positive CSRF blocks.
  if (
    hasInAppWebViewUserAgent(req) &&
    isInAppWebViewCompatibleMutatingPath(req.nextUrl.pathname) &&
    isSameOriginReferer(req)
  ) {
    return false;
  }

  return true;
}

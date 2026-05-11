import type { NextRequest, NextResponse } from "next/server";

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

export function isCrossSiteStateChangingRequest(req: NextRequest): boolean {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;

  const secFetchSite = (req.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  // Only block when browser explicitly marks the request as cross-site.
  // "none" can appear in some in-app WebViews (WeChat/QQ/Quark/Baidu) for
  // same-origin fetch/XHR; treat it like a missing header → fall through to origin check.
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site" && secFetchSite !== "none") {
    return true;
  }

  const origin = req.headers.get("origin");
  if (!origin) return false;
  const expected = getExpectedRequestOrigin(req);
  return origin !== expected;
}

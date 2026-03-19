import type { NextRequest, NextResponse } from "next/server";

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

  const secFetchSite = req.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "same-site") return true;

  const origin = req.headers.get("origin");
  if (!origin) return false;
  const expected = req.nextUrl.origin;
  return origin !== expected;
}

// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { envRaw } from "@/lib/config/envRaw";
import {
  getPreviewAccessCookieName,
  isPreviewAccessConfigured,
  sanitizePreviewAccessNext,
  verifyPreviewAccessSession,
} from "@/lib/previewAccess";
import {
  applySecurityHeaders,
  hasPotentialHeaderInjection,
  isCrossSiteStateChangingRequest,
  isSuspiciousPath,
} from "@/lib/security/http";
import { getPrunedUiRedirectPath } from "@/lib/ui/prunedUiRoutes";

type Entry = { count: number; resetAt: number };

function createRateLimiter(limit: number, intervalMs: number) {
  const store = new Map<string, Entry>();
  const CLEANUP_INTERVAL = 60000;
  let lastCleanup = Date.now();

  return (ip: string): boolean => {
    const now = Date.now();
    if (now - lastCleanup > CLEANUP_INTERVAL) {
      for (const [key, v] of store) {
        if (v.resetAt < now) store.delete(key);
      }
      lastCleanup = now;
    }

    const cur = store.get(ip);
    if (!cur) {
      store.set(ip, { count: 1, resetAt: now + intervalMs });
      return true;
    }
    if (now >= cur.resetAt) {
      store.set(ip, { count: 1, resetAt: now + intervalMs });
      return true;
    }
    if (cur.count >= limit) return false;
    cur.count++;
    return true;
  };
}

const generalLimiter = createRateLimiter(10, 1000);
const llmLimiter = createRateLimiter(2, 1000);

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return (req as unknown as { ip?: string }).ip ?? "unknown";
}

const RATE_LIMITED_JSON = {
  error: "rate_limited",
  message: "请求过于频繁，请稍后再试。",
};
const PREVIEW_NOINDEX = "noindex, nofollow";
const PREVIEW_CANONICAL_HOST = "preview.versecraft.cn";

function normalizeHost(value: string | null): string {
  const first = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "";
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end >= 0 ? first.slice(1, end) : first;
  }
  return first.split(":")[0] ?? first;
}

function getRequestHost(req: NextRequest): string {
  return normalizeHost(req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
}

function getPreviewHosts(): Set<string> {
  const raw = envRaw("PREVIEW_ACCESS_HOSTS") ?? PREVIEW_CANONICAL_HOST;
  return new Set(
    raw
      .split(",")
      .map((v) => normalizeHost(v))
      .filter(Boolean)
  );
}

function isPreviewAccessEnabledForHost(host: string): boolean {
  if ((envRaw("PREVIEW_ACCESS_ENABLED") ?? "").toLowerCase() !== "true") return false;
  return getPreviewHosts().has(host);
}

function isNoindexPreviewHost(host: string): boolean {
  return host === PREVIEW_CANONICAL_HOST || isPreviewAccessEnabledForHost(host);
}

function isPreviewBypassPath(pathname: string): boolean {
  return (
    pathname === "/preview-access" ||
    pathname.startsWith("/preview-access/") ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image/") ||
    pathname === "/assets" ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sw.js"
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function shouldRedirectToPreviewAccess(req: NextRequest): boolean {
  return req.method === "GET" || req.method === "HEAD";
}

function withHeaders(
  response: NextResponse,
  options: { previewHost: boolean; previewAccessPage?: boolean }
) {
  const secured = applySecurityHeaders(response);
  if (options.previewHost) {
    secured.headers.set("X-Robots-Tag", PREVIEW_NOINDEX);
    if (options.previewAccessPage) {
      secured.headers.set("Cache-Control", "no-store");
    }
  }
  return secured;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);
  const isStream = pathname === "/api/chat";
  const requestHost = getRequestHost(req);
  const isPreviewHost = isNoindexPreviewHost(requestHost);
  const isPreviewGateHost = isPreviewAccessEnabledForHost(requestHost);

  if (isSuspiciousPath(pathname)) {
    return withHeaders(NextResponse.json({ error: "invalid_path" }, { status: 400 }), { previewHost: isPreviewHost });
  }

  const host = req.headers.get("host") ?? "";
  const forwardedHost = req.headers.get("x-forwarded-host") ?? "";
  if (hasPotentialHeaderInjection(host) || hasPotentialHeaderInjection(forwardedHost)) {
    return withHeaders(NextResponse.json({ error: "invalid_header" }, { status: 400 }), { previewHost: isPreviewHost });
  }

  if (isCrossSiteStateChangingRequest(req)) {
    return withHeaders(NextResponse.json({ error: "csrf_check_failed" }, { status: 403 }), { previewHost: isPreviewHost });
  }

  if (isPreviewGateHost && !isPreviewBypassPath(pathname)) {
    if (!isPreviewAccessConfigured()) {
      const response = isApiPath(pathname) || !shouldRedirectToPreviewAccess(req)
        ? NextResponse.json({ error: "preview_access_not_configured" }, { status: 503 })
        : NextResponse.redirect(new URL("/preview-access", req.nextUrl));
      return withHeaders(response, { previewHost: true });
    }

    const sessionCookie = req.cookies.get(getPreviewAccessCookieName())?.value;
    if (!(await verifyPreviewAccessSession(sessionCookie))) {
      if (isApiPath(pathname) || !shouldRedirectToPreviewAccess(req)) {
        return withHeaders(
          NextResponse.json({ error: "preview_access_required" }, { status: 401 }),
          { previewHost: true }
        );
      }

      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/preview-access";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("next", sanitizePreviewAccessNext(`${pathname}${req.nextUrl.search}`));
      return withHeaders(NextResponse.redirect(redirectUrl), { previewHost: true });
    }
  }

  const prunedUiRedirectPath = getPrunedUiRedirectPath(pathname);
  if (prunedUiRedirectPath) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = prunedUiRedirectPath;
    redirectUrl.search = "";
    return withHeaders(NextResponse.redirect(redirectUrl), { previewHost: isPreviewHost });
  }

  if (isStream) {
    if (!llmLimiter(ip)) {
      return withHeaders(NextResponse.json(RATE_LIMITED_JSON, { status: 429 }), { previewHost: isPreviewHost });
    }
  } else if (!generalLimiter(ip)) {
    return withHeaders(NextResponse.json(RATE_LIMITED_JSON, { status: 429 }), { previewHost: isPreviewHost });
  }

  return withHeaders(NextResponse.next(), {
    previewHost: isPreviewHost,
    previewAccessPage: pathname === "/preview-access",
  });
}

export const config = {
  matcher: [
    "/api/:path*",
    "/favicon.ico",
    "/robots.txt",
    "/sw.js",
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff|woff2)$).*)",
  ],
};

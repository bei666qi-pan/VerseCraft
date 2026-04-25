// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applySecurityHeaders, hasPotentialHeaderInjection, isCrossSiteStateChangingRequest, isSuspiciousPath } from "@/lib/security/http";
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

const RATE_LIMITED_JSON = { error: "rate_limited", message: "请求过于频繁，请稍后再试。" };

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const ip = getClientIp(req);
  const isStream = pathname === "/api/chat";

  if (isSuspiciousPath(pathname)) {
    return applySecurityHeaders(NextResponse.json({ error: "invalid_path" }, { status: 400 }));
  }

  const host = req.headers.get("host") ?? "";
  if (hasPotentialHeaderInjection(host)) {
    return applySecurityHeaders(NextResponse.json({ error: "invalid_header" }, { status: 400 }));
  }

  if (isCrossSiteStateChangingRequest(req)) {
    return applySecurityHeaders(NextResponse.json({ error: "csrf_check_failed" }, { status: 403 }));
  }

  const prunedUiRedirectPath = getPrunedUiRedirectPath(pathname);
  if (prunedUiRedirectPath) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = prunedUiRedirectPath;
    redirectUrl.search = "";
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  if (isStream) {
    if (!llmLimiter(ip)) {
      return applySecurityHeaders(NextResponse.json(RATE_LIMITED_JSON, { status: 429 }));
    }
  } else {
    if (!generalLimiter(ip)) {
      return applySecurityHeaders(NextResponse.json(RATE_LIMITED_JSON, { status: 429 }));
    }
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    "/api/:path*",
    "/guide/:path*",
    "/help/:path*",
    "/tutorial/:path*",
    "/manual/:path*",
    "/notes/:path*",
    "/journal/:path*",
    "/inspiration/:path*",
    "/memo/:path*",
    "/inventory/:path*",
    "/warehouse/:path*",
    "/storage/:path*",
    "/bag/:path*",
    "/backpack/:path*",
    "/items/:path*",
    "/repository/:path*",
    "/repositories/:path*",
    "/achievement/:path*",
    "/achievements/:path*",
    "/badge/:path*",
    "/badges/:path*",
    "/trophy/:path*",
    "/trophies/:path*",
    "/weapon/:path*",
    "/weapons/:path*",
    "/armory/:path*",
    "/arsenal/:path*",
    "/equipment/:path*",
    "/equip/:path*",
    "/taskbar/:path*",
    "/tasks/:path*",
    "/task/:path*",
    "/toolbar/:path*",
    "/dock/:path*",
    "/bottom-bar/:path*",
    "/sidebar/:path*",
    "/action-bar/:path*",
  ],
};

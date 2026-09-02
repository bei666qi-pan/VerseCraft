import type { AdminActor } from "./authGuard";

const windows = new Map<string, { count: number; resetAt: number }>();

function publicRequestOrigin(req: Request): string {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const host = forwardedHost || req.headers.get("host")?.trim();
  if ((forwardedProto === "https" || forwardedProto === "http") && host) {
    try { return new URL(`${forwardedProto}://${host}`).origin; } catch { return new URL(req.url).origin; }
  }
  return new URL(req.url).origin;
}

export function verifySameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site" && fetchSite !== "none") return false;
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).origin === publicRequestOrigin(req);
  } catch {
    return false;
  }
}

export function checkAiManagementMutationRate(actor: AdminActor): { allowed: boolean; retryAfterSeconds: number } {
  const key = actor.ipHash ?? actor.actorId;
  const now = Date.now();
  const current = windows.get(key);
  if (!current || now >= current.resetAt) {
    windows.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= 20) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

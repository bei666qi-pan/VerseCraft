import { normalizeWebTrafficPathname, normalizeWebTrafficVisitorId } from "@/lib/analytics/webTraffic";

export type ValidPageViewRequest = { pathname: string; visitorId: string; eventId: string };

export function shouldCollectPageView(enabled: boolean): boolean {
  return enabled;
}

export function parsePageViewRequest(value: unknown): ValidPageViewRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const pathname = normalizeWebTrafficPathname(body.pathname);
  const visitorId = normalizeWebTrafficVisitorId(body.visitorId);
  const eventId = typeof body.eventId === "string" && /^[A-Za-z0-9_-]{16,96}$/.test(body.eventId) ? body.eventId : null;
  return pathname && visitorId && eventId ? { pathname, visitorId, eventId } : null;
}

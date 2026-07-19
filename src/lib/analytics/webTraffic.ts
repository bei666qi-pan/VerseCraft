export const WEB_TRAFFIC_VISITOR_ID_MAX_LENGTH = 96;

const INTERNAL_PATH_PREFIXES = ["/api", "/saiduhsa", "/preview"] as const;

export function normalizeWebTrafficPathname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const pathname = value.trim();
  if (!pathname || pathname.length > 200 || !pathname.startsWith("/")) return null;
  if (pathname.includes("?") || pathname.includes("#") || pathname.includes("//") || /[\u0000-\u001F]/.test(pathname)) return null;
  if (INTERNAL_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  return pathname;
}

export function normalizeWebTrafficVisitorId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const visitorId = value.trim();
  if (visitorId.length < 16 || visitorId.length > WEB_TRAFFIC_VISITOR_ID_MAX_LENGTH) return null;
  return /^[A-Za-z0-9_-]+$/.test(visitorId) ? visitorId : null;
}

export type WebTrafficEventLike = { visitorId?: unknown };

export function getBeijingDateKey(date: Date = new Date()): string {
  return appDateLabel(date);
}

export function getBeijingDateRange(dateKey: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error("invalid_beijing_date_key");
  // 12:00 UTC always falls on the supplied Beijing calendar day.
  const reference = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(reference.getTime()) || getBeijingDateKey(reference) !== dateKey) throw new Error("invalid_beijing_date_key");
  return { start: appStartOfDayUtc(reference), end: appEndOfDayUtc(reference) };
}

export function aggregateWebTrafficEvents(events: readonly WebTrafficEventLike[]): { pageViews: number; uniqueVisitors: number } {
  const visitorIds = new Set<string>();
  for (const event of events) {
    const visitorId = normalizeWebTrafficVisitorId(event.visitorId);
    if (visitorId) visitorIds.add(visitorId);
  }
  return { pageViews: events.length, uniqueVisitors: visitorIds.size };
}
import { appDateLabel, appEndOfDayUtc, appStartOfDayUtc } from "@/lib/admin/appTimezone";

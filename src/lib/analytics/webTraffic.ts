export const WEB_TRAFFIC_VISITOR_ID_MAX_LENGTH = 96;
export const WEB_TRAFFIC_VISITOR_ID_SQL_PATTERN = "^[A-Za-z0-9_-]{16,96}$";
export const WEB_TRAFFIC_SOURCE_VALUES = ["direct", "internal", "search", "social", "referral"] as const;
export type WebTrafficSource = (typeof WEB_TRAFFIC_SOURCE_VALUES)[number];

const INTERNAL_PATH_PREFIXES = ["/api", "/admin", "/preview"] as const;

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

export function normalizeWebTrafficSource(value: unknown): WebTrafficSource | null {
  return typeof value === "string" && (WEB_TRAFFIC_SOURCE_VALUES as readonly string[]).includes(value)
    ? (value as WebTrafficSource)
    : null;
}

const SEARCH_REFERRER_HOSTS = /(^|\.)(google\.[a-z.]+|baidu\.com|bing\.com|so\.com|sogou\.com|duckduckgo\.com|yahoo\.com|yandex\.[a-z.]+)$/i;
const SOCIAL_REFERRER_HOSTS = /(^|\.)(weibo\.com|xiaohongshu\.com|douyin\.com|bilibili\.com|weixin\.qq\.com|mp\.weixin\.qq\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|linkedin\.com|tiktok\.com|reddit\.com|discord\.com|t\.me|telegram\.me)$/i;

/** Maps a browser referrer to a coarse category; the raw URL and hostname are never persisted. */
export function classifyWebTrafficSource(referrer: unknown, currentOrigin: unknown): WebTrafficSource {
  if (typeof referrer !== "string" || !referrer.trim()) return "direct";
  try {
    const referrerUrl = new URL(referrer);
    if (typeof currentOrigin === "string" && currentOrigin && referrerUrl.origin === currentOrigin) return "internal";
    if (SEARCH_REFERRER_HOSTS.test(referrerUrl.hostname)) return "search";
    if (SOCIAL_REFERRER_HOSTS.test(referrerUrl.hostname)) return "social";
    return "referral";
  } catch {
    return "referral";
  }
}

export type WebTrafficEventLike = { visitorId?: unknown; trafficSource?: unknown };

export type WebTrafficSourceAggregate = {
  source: WebTrafficSource;
  pageViews: number;
  uniqueVisitors: number;
};

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

export function aggregateWebTrafficSources(events: readonly WebTrafficEventLike[]): WebTrafficSourceAggregate[] {
  const buckets = new Map<WebTrafficSource, { pageViews: number; visitorIds: Set<string> }>();
  for (const event of events) {
    const source = normalizeWebTrafficSource(event.trafficSource) ?? "direct";
    const bucket = buckets.get(source) ?? { pageViews: 0, visitorIds: new Set<string>() };
    bucket.pageViews++;
    const visitorId = normalizeWebTrafficVisitorId(event.visitorId);
    if (visitorId) bucket.visitorIds.add(visitorId);
    buckets.set(source, bucket);
  }
  return WEB_TRAFFIC_SOURCE_VALUES.map((source) => {
    const bucket = buckets.get(source);
    return { source, pageViews: bucket?.pageViews ?? 0, uniqueVisitors: bucket?.visitorIds.size ?? 0 };
  });
}
import { appDateLabel, appEndOfDayUtc, appStartOfDayUtc } from "@/lib/admin/appTimezone";

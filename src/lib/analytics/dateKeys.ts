export function getUtcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function parseUtcDateKeyToDate(dateKey: string): Date {
  // dateKey: YYYY-MM-DD (UTC)
  // This makes JS date interpret as UTC to avoid TZ drift.
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function derivePlatformFromUserAgent(userAgent: string | undefined | null): "mobile" | "desktop" | "unknown" {
  const ua = String(userAgent ?? "").toLowerCase();
  if (!ua) return "unknown";
  if (/iphone|ipad|ipod|android|mobile|mini|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}


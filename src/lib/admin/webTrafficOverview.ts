import { WEB_TRAFFIC_SOURCE_VALUES, normalizeWebTrafficSource, type WebTrafficSource } from "@/lib/analytics/webTraffic";

export type WebTrafficOverviewRow = Record<string, unknown>;

export type WebTrafficSourceMetric = {
  source: WebTrafficSource;
  pageViews: number;
  uniqueVisitors: number;
};

export type WebTrafficDailyMetric = {
  pageViews: number;
  uniqueVisitors: number;
  sources: WebTrafficSourceMetric[];
};

function count(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/** Converts one authoritative SQL grouping-set result into a stable admin response shape. */
export function buildWebTrafficDailyMetric(rows: readonly WebTrafficOverviewRow[], dateKey: string): WebTrafficDailyMetric {
  const matching = rows.filter((row) => String(row.dateKey ?? "") === dateKey);
  const total = matching.find((row) => row.trafficSource === "__total__");
  return {
    pageViews: count(total?.pageViews),
    uniqueVisitors: count(total?.uniqueVisitors),
    sources: WEB_TRAFFIC_SOURCE_VALUES.map((source) => {
      const row = matching.find((candidate) => normalizeWebTrafficSource(candidate.trafficSource) === source);
      return { source, pageViews: count(row?.pageViews), uniqueVisitors: count(row?.uniqueVisitors) };
    }),
  };
}

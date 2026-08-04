import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("overview and daily rebuild use the same valid visitor-id guard on the event log", () => {
  const overview = readFileSync(join(process.cwd(), "src/lib/admin/backofficeMetrics.ts"), "utf8");
  const aggregation = readFileSync(join(process.cwd(), "src/lib/analytics/aggregation.ts"), "utf8");

  assert.match(overview, /FROM analytics_events/);
  assert.match(overview, /GROUPING SETS/);
  assert.match(overview, /WEB_TRAFFIC_VISITOR_ID_SQL_PATTERN/);
  assert.match(overview, /trafficSource/);
  assert.match(aggregation, /WEB_TRAFFIC_VISITOR_ID_SQL_PATTERN/);
  assert.match(aggregation, /COUNT\(DISTINCT CASE/);
});

test("admin overview renders a plain-language traffic source panel", () => {
  const dashboard = readFileSync(join(process.cwd(), "src/components/admin/AdminDashboardV2.tsx"), "utf8");
  assert.match(dashboard, /今日访问从哪里来/);
  assert.match(dashboard, /直接访问/);
  assert.match(dashboard, /不保存原始跳转链接、域名、搜索词或 UTM/);
  assert.match(dashboard, /admin-traffic-source-panel/);
});

test("admin SQL performance gate exercises the authoritative traffic query", () => {
  const baseline = readFileSync(join(process.cwd(), "scripts/admin-explain-baseline.ts"), "utf8");
  assert.match(baseline, /overview_web_traffic_today/);
  assert.match(baseline, /event_name = 'page_viewed'/);
  assert.match(baseline, /GROUPING SETS/);
  assert.match(baseline, /\^\[A-Za-z0-9_-\]\{16,96\}\$/);
});

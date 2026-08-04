import assert from "node:assert/strict";
import test from "node:test";
import { buildWebTrafficDailyMetric } from "@/lib/admin/webTrafficOverview";

test("overview keeps total UV authoritative instead of summing source UV", () => {
  const metric = buildWebTrafficDailyMetric([
    { dateKey: "2026-07-20", trafficSource: "__total__", pageViews: 3, uniqueVisitors: 2 },
    { dateKey: "2026-07-20", trafficSource: "search", pageViews: 2, uniqueVisitors: 1 },
    { dateKey: "2026-07-20", trafficSource: "social", pageViews: 1, uniqueVisitors: 2 },
    { dateKey: "2026-07-19", trafficSource: "__total__", pageViews: 99, uniqueVisitors: 99 },
  ], "2026-07-20");

  assert.equal(metric.pageViews, 3);
  assert.equal(metric.uniqueVisitors, 2);
  assert.deepEqual(metric.sources.find((item) => item.source === "search"), { source: "search", pageViews: 2, uniqueVisitors: 1 });
  assert.deepEqual(metric.sources.find((item) => item.source === "social"), { source: "social", pageViews: 1, uniqueVisitors: 2 });
});

test("overview source shape remains complete for empty traffic", () => {
  const metric = buildWebTrafficDailyMetric([], "2026-07-20");
  assert.equal(metric.pageViews, 0);
  assert.equal(metric.uniqueVisitors, 0);
  assert.deepEqual(metric.sources.map((item) => item.source), ["direct", "internal", "search", "social", "referral"]);
});

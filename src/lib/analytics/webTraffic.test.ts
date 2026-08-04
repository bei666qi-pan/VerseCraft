import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateWebTrafficEvents,
  aggregateWebTrafficSources,
  classifyWebTrafficSource,
  getBeijingDateKey,
  getBeijingDateRange,
  normalizeWebTrafficPathname,
  normalizeWebTrafficSource,
  normalizeWebTrafficVisitorId,
} from "@/lib/analytics/webTraffic";
import { parsePageViewRequest, shouldCollectPageView } from "@/lib/analytics/pageViewRequest";

const VISITOR_A = "a".repeat(24);
const VISITOR_B = "b".repeat(24);

test("web traffic accepts only privacy-minimized public paths and stable anonymous visitor ids", () => {
  assert.equal(normalizeWebTrafficPathname("/play"), "/play");
  assert.equal(normalizeWebTrafficPathname("/play?secret=1"), null);
  assert.equal(normalizeWebTrafficPathname("/saiduhsa"), null);
  assert.equal(normalizeWebTrafficPathname("/api/admin/overview"), null);
  assert.equal(normalizeWebTrafficVisitorId(VISITOR_A), VISITOR_A);
  assert.equal(normalizeWebTrafficVisitorId("short"), null);
  assert.equal(normalizeWebTrafficVisitorId("contains space"), null);
});

test("web traffic keeps every page view but deduplicates only valid visitor ids", () => {
  assert.deepEqual(
    aggregateWebTrafficEvents([{ visitorId: VISITOR_A }, { visitorId: VISITOR_A }, { visitorId: VISITOR_B }, { visitorId: "" }]),
    { pageViews: 4, uniqueVisitors: 2 }
  );
});

test("page-view request contract rejects malformed and internal-path traffic", () => {
  const eventId = "event_" + "x".repeat(24);
  assert.deepEqual(parsePageViewRequest({ pathname: "/", visitorId: VISITOR_A, eventId }), { pathname: "/", visitorId: VISITOR_A, eventId, trafficSource: "direct" });
  assert.deepEqual(parsePageViewRequest({ pathname: "/", visitorId: VISITOR_A, eventId, trafficSource: "search" }), { pathname: "/", visitorId: VISITOR_A, eventId, trafficSource: "search" });
  assert.equal(parsePageViewRequest({ pathname: "/saiduhsa", visitorId: VISITOR_A, eventId }), null);
  assert.equal(parsePageViewRequest({ pathname: "/", visitorId: VISITOR_A, eventId: "bad" }), null);
  assert.equal(parsePageViewRequest({ pathname: "/", visitorId: VISITOR_A, eventId, trafficSource: "raw-referrer.example" }), null);
});

test("traffic source classification stores only coarse categories", () => {
  assert.equal(classifyWebTrafficSource("", "https://versecraft.cn"), "direct");
  assert.equal(classifyWebTrafficSource("https://versecraft.cn/intro?from=secret", "https://versecraft.cn"), "internal");
  assert.equal(classifyWebTrafficSource("https://www.google.com/search?q=versecraft", "https://versecraft.cn"), "search");
  assert.equal(classifyWebTrafficSource("https://www.xiaohongshu.com/explore/123", "https://versecraft.cn"), "social");
  assert.equal(classifyWebTrafficSource("https://partner.example/path", "https://versecraft.cn"), "referral");
  assert.equal(normalizeWebTrafficSource("https://partner.example/path"), null);
});

test("source aggregates preserve PV while excluding malformed visitor ids from UV", () => {
  assert.deepEqual(
    aggregateWebTrafficSources([
      { visitorId: VISITOR_A, trafficSource: "search" },
      { visitorId: VISITOR_A, trafficSource: "search" },
      { visitorId: "bad", trafficSource: "social" },
    ]),
    [
      { source: "direct", pageViews: 0, uniqueVisitors: 0 },
      { source: "internal", pageViews: 0, uniqueVisitors: 0 },
      { source: "search", pageViews: 2, uniqueVisitors: 1 },
      { source: "social", pageViews: 1, uniqueVisitors: 0 },
      { source: "referral", pageViews: 0, uniqueVisitors: 0 },
    ]
  );
});

test("feature flag can disable page-view collection without rejecting the page request", () => {
  assert.equal(shouldCollectPageView(true), true);
  assert.equal(shouldCollectPageView(false), false);
});

test("Beijing daily range isolates events across the UTC+8 midnight boundary", () => {
  const range = getBeijingDateRange("2026-07-19");
  assert.equal(range.start.toISOString(), "2026-07-18T16:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-07-19T15:59:59.999Z");
  assert.equal(getBeijingDateKey(new Date("2026-07-18T15:59:59.999Z")), "2026-07-18");
  assert.equal(getBeijingDateKey(new Date("2026-07-18T16:00:00.000Z")), "2026-07-19");
});

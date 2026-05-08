import test from "node:test";
import assert from "node:assert/strict";
import {
  computeJourneyFunnelStages,
  normalizeJourneyFunnelEvents,
  parseJourneyFunnelMode,
} from "@/lib/admin/journeyFunnel";

const ORDER = ["home_viewed", "world_selected", "character_create_success"] as const;

test("strict funnel counts actors only when stages happen in order", () => {
  const events = normalizeJourneyFunnelEvents(
    [
      { eventName: "home_viewed", actorKey: "g:a", eventTime: "2026-05-01T00:00:00.000Z" },
      { eventName: "world_selected", actorKey: "g:a", eventTime: "2026-05-01T00:01:00.000Z" },
      { eventName: "character_create_success", actorKey: "g:a", eventTime: "2026-05-01T00:02:00.000Z" },
      { eventName: "home_viewed", actorKey: "g:b", eventTime: "2026-05-01T00:00:00.000Z" },
      { eventName: "world_selected", actorKey: "g:b", eventTime: "2026-05-01T00:03:00.000Z" },
      { eventName: "character_create_success", actorKey: "g:b", eventTime: "2026-05-01T00:02:00.000Z" },
    ],
    { actorType: "all", platform: "all" }
  );

  const strict = computeJourneyFunnelStages(ORDER, events, "strict");

  assert.equal(strict[0]?.count, 2);
  assert.equal(strict[1]?.count, 2);
  assert.equal(strict[2]?.count, 1);
  assert.equal(strict[1]?.stepConversionRate, 1);
  assert.equal(strict[1]?.isBiggestDrop, true);
});

test("strict funnel does not count later stages when an actor skips earlier stages", () => {
  const events = normalizeJourneyFunnelEvents(
    [
      { eventName: "character_create_success", actorKey: "g:skip", eventTime: "2026-05-01T00:02:00.000Z" },
      { eventName: "home_viewed", actorKey: "g:ok", eventTime: "2026-05-01T00:00:00.000Z" },
      { eventName: "world_selected", actorKey: "g:ok", eventTime: "2026-05-01T00:01:00.000Z" },
      { eventName: "character_create_success", actorKey: "g:ok", eventTime: "2026-05-01T00:02:00.000Z" },
    ],
    { actorType: "all", platform: "all" }
  );

  const strict = computeJourneyFunnelStages(ORDER, events, "strict");
  const anyOrder = computeJourneyFunnelStages(ORDER, events, "any_order");

  assert.equal(strict[2]?.count, 1);
  assert.equal(anyOrder[2]?.count, 2);
});

test("any_order and strict can produce different funnel counts", () => {
  const events = normalizeJourneyFunnelEvents(
    [
      { eventName: "home_viewed", actorKey: "g:late", eventTime: "2026-05-01T00:05:00.000Z" },
      { eventName: "world_selected", actorKey: "g:late", eventTime: "2026-05-01T00:01:00.000Z" },
      { eventName: "create_character_success", actorKey: "g:late", eventTime: "2026-05-01T00:06:00.000Z" },
    ],
    { actorType: "all", platform: "all" }
  );

  const strict = computeJourneyFunnelStages(ORDER, events, "strict");
  const anyOrder = computeJourneyFunnelStages(ORDER, events, "any_order");

  assert.equal(strict[0]?.count, 1);
  assert.equal(strict[1]?.count, 0);
  assert.equal(anyOrder[1]?.count, 1);
  assert.equal(anyOrder[2]?.count, 1);
});

test("actorType and platform filters are applied before funnel calculation", () => {
  const events = normalizeJourneyFunnelEvents(
    [
      { eventName: "home_viewed", userId: "u1", sessionId: "s1", platform: "desktop", eventTime: "2026-05-01T00:00:00.000Z" },
      { eventName: "home_viewed", guestId: "g1", sessionId: "s2", platform: "mobile", eventTime: "2026-05-01T00:00:00.000Z" },
      { eventName: "home_viewed", actorType: "guest", actorId: "g:g2", platform: "desktop", eventTime: "2026-05-01T00:00:00.000Z" },
    ],
    { actorType: "guest", platform: "mobile" }
  );

  const strict = computeJourneyFunnelStages(ORDER, events, "strict");

  assert.equal(events.length, 1);
  assert.equal(events[0]?.actorKey, "g:g1");
  assert.equal(strict[0]?.count, 1);
});

test("parseJourneyFunnelMode defaults to strict", () => {
  assert.equal(parseJourneyFunnelMode("any_order"), "any_order");
  assert.equal(parseJourneyFunnelMode("strict"), "strict");
  assert.equal(parseJourneyFunnelMode(null), "strict");
});

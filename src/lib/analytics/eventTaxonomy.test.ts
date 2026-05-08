import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANALYTICS_EVENT_TAXONOMY,
  validateAnalyticsEventContract,
} from "@/lib/analytics/eventTaxonomy";

function analyticsEventNamesFromTypes(): string[] {
  const source = readFileSync(join(process.cwd(), "src/lib/analytics/types.ts"), "utf8");
  const match = source.match(/export type AnalyticsEventName =([\s\S]*?);/);
  assert.ok(match, "AnalyticsEventName union must be parseable");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

test("event taxonomy covers every AnalyticsEventName", () => {
  const names = analyticsEventNamesFromTypes();
  const taxonomyNames = Object.keys(ANALYTICS_EVENT_TAXONOMY).sort();

  assert.deepEqual(taxonomyNames, [...names].sort());
});

test("event taxonomy entries are self-consistent", () => {
  for (const [eventName, contract] of Object.entries(ANALYTICS_EVENT_TAXONOMY)) {
    assert.equal(contract.eventName, eventName);
    assert.equal(typeof contract.description, "string");
    assert.ok(contract.description.trim().length > 0);
    assert.ok(contract.version >= 1);
    assert.ok(contract.owner.trim().length > 0);
  }
});

test("validateAnalyticsEventContract reports missing identity and payload keys", () => {
  const result = validateAnalyticsEventContract({
    eventName: "home_viewed",
    sessionId: "",
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_identity");
  assert.deepEqual(result.missingIdentity, ["sessionId"]);
});

test("validateAnalyticsEventContract passes a valid event", () => {
  const result = validateAnalyticsEventContract({
    eventName: "chat_request_finished",
    sessionId: "session-1",
    payload: {
      requestId: "rq-1",
      success: true,
      totalLatencyMs: 1200,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, "ok");
});

test("validateAnalyticsEventContract rejects sensitive payload keys", () => {
  const result = validateAnalyticsEventContract({
    eventName: "feedback_submitted",
    sessionId: "session-1",
    payload: {
      source: "home",
      nested: { databaseUrl: "postgres://example" },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "sensitive_payload_keys");
  assert.deepEqual(result.sensitivePayloadKeys, ["nested.databaseUrl"]);
});

test("validateAnalyticsEventContract rejects unknown event names", () => {
  const result = validateAnalyticsEventContract({
    eventName: "not_a_real_event",
    sessionId: "session-1",
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "unknown_event");
});

test("content quality events require worldId and chapterId payload", () => {
  for (const eventName of [
    "chapter_entered",
    "chapter_completed",
    "chapter_abandoned",
    "npc_interaction_started",
    "npc_interaction_completed",
    "npc_interaction_failed",
    "regen_clicked",
    "retry_clicked",
    "narrative_eval_sampled",
  ]) {
    const result = validateAnalyticsEventContract({
      eventName,
      sessionId: "session-1",
      payload: { worldId: "dark_moon" },
    });
    assert.equal(result.ok, false, eventName);
    assert.equal(result.reason, "missing_payload_keys", eventName);
    assert.deepEqual(result.missingPayloadKeys, ["chapterId"], eventName);
  }
});

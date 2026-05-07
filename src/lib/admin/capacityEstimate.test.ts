import test from "node:test";
import assert from "node:assert/strict";
import { computeAdminCapacityEstimate } from "@/lib/admin/capacityEstimate";

test("capacity estimate withholds conclusion when health is degraded", () => {
  const r = computeAdminCapacityEstimate({
    queueEnabled: true,
    queueDepthKnown: true,
    runningCount: 1,
    queuedCount: 0,
    maxRunning: 4,
    maxQueued: 80,
    dbOk: true,
    aiGatewayOk: false,
    recentAiSampleSize: 30,
  });
  assert.equal(r.status, "unavailable");
  assert.equal(r.remainingConcurrentActions, null);
  assert.equal(r.confidence, "low");
});

test("capacity estimate does not invent capacity without recent AI samples", () => {
  const r = computeAdminCapacityEstimate({
    queueEnabled: true,
    queueDepthKnown: true,
    runningCount: 1,
    queuedCount: 0,
    maxRunning: 4,
    maxQueued: 80,
    dbOk: true,
    aiGatewayOk: true,
    recentAiSampleSize: 2,
  });
  assert.equal(r.status, "sample_insufficient");
  assert.equal(r.remainingConcurrentActions, null);
});

test("capacity estimate reports immediate queue-backed capacity when evidence is available", () => {
  const r = computeAdminCapacityEstimate({
    queueEnabled: true,
    queueDepthKnown: true,
    runningCount: 2,
    queuedCount: 3,
    maxRunning: 4,
    maxQueued: 80,
    dbOk: true,
    aiGatewayOk: true,
    recentAiSampleSize: 24,
  });
  assert.equal(r.status, "ready");
  assert.equal(r.remainingConcurrentActions, 2);
  assert.equal(r.confidence, "high");
});

import test from "node:test";
import assert from "node:assert/strict";
import { computeHeartbeatDelta } from "./sessionClock";

test("computeHeartbeatDelta clamps long gaps and classifies visible passive as read", () => {
  const delta = computeHeartbeatDelta({
    lastSeenAtMs: 0,
    nowMs: 999_999_999,
    kind: "passive",
    visibility: "visible",
    maxGapMs: 120_000,
  });
  assert.ok(delta.onlineSec <= 120);
  assert.equal(delta.activePlaySec, 0);
  assert.equal(delta.idleSec, 0);
  assert.equal(delta.readSec, delta.onlineSec);
});

test("computeHeartbeatDelta classifies hidden as idle", () => {
  const delta = computeHeartbeatDelta({
    lastSeenAtMs: 1000,
    nowMs: 61_000,
    kind: "active",
    visibility: "hidden",
  });
  assert.equal(delta.onlineSec, 60);
  assert.equal(delta.idleSec, 60);
  assert.equal(delta.activePlaySec, 0);
  assert.equal(delta.readSec, 0);
});

test("computeHeartbeatDelta classifies visible active as activePlay", () => {
  const delta = computeHeartbeatDelta({
    lastSeenAtMs: 1000,
    nowMs: 31_000,
    kind: "active",
    visibility: "visible",
  });
  assert.equal(delta.onlineSec, 30);
  assert.equal(delta.activePlaySec, 30);
});


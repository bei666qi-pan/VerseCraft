import assert from "node:assert/strict";
import test from "node:test";

import { canDeleteWorldEngineRun } from "./retentionPolicy";

const now = new Date("2026-09-02T00:00:00.000Z");

test("retention keeps a run while any agenda item is non-terminal", () => {
  assert.equal(canDeleteWorldEngineRun({
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    now,
    retentionDays: 30,
    eventStatuses: ["resolved", "pending"],
  }), false);
});

test("retention deletes only old runs whose dependent records are terminal", () => {
  assert.equal(canDeleteWorldEngineRun({
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    now,
    retentionDays: 30,
    eventStatuses: ["resolved", "expired", "rejected"],
  }), true);
  assert.equal(canDeleteWorldEngineRun({
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    now,
    retentionDays: 30,
    eventStatuses: [],
  }), false);
});

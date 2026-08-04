import test from "node:test";
import assert from "node:assert/strict";
import { shouldOmitPlayerKnownSummaryForNpcActor } from "./filter";

test("shouldOmitPlayerKnownSummaryForNpcActor: always returns true (prevents script-reading)", () => {
  assert.equal(shouldOmitPlayerKnownSummaryForNpcActor(null), true);
  assert.equal(shouldOmitPlayerKnownSummaryForNpcActor({} as any), true);
  assert.equal(
    shouldOmitPlayerKnownSummaryForNpcActor({ actorId: "N-001", knownFactIds: ["F-001"] } as any),
    true
  );
});

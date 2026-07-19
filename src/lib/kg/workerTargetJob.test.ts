import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkerTargetJobId, selectWorkerJobs } from "./workerTargetJob";

test("worker target job id accepts only positive safe integer ids", () => {
  assert.equal(parseWorkerTargetJobId("42"), 42);
  assert.equal(parseWorkerTargetJobId(undefined), null);
  assert.equal(parseWorkerTargetJobId("0"), null);
  assert.equal(parseWorkerTargetJobId("-1"), null);
  assert.equal(parseWorkerTargetJobId("4.2"), null);
  assert.equal(parseWorkerTargetJobId("abc"), null);
});

test("targeted worker never falls through to unrelated claimed jobs", () => {
  assert.deepEqual(selectWorkerJobs({ targetJobId: 42, targetedJob: { id: 42 }, claimedBatch: [{ id: 1 }, { id: 2 }] }), [{ id: 42 }]);
  assert.deepEqual(selectWorkerJobs({ targetJobId: 42, targetedJob: null, claimedBatch: [{ id: 1 }, { id: 2 }] }), []);
  assert.deepEqual(selectWorkerJobs({ targetJobId: null, targetedJob: null, claimedBatch: [{ id: 1 }, { id: 2 }] }), [{ id: 1 }, { id: 2 }]);
});

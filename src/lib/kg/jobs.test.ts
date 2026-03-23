import { test } from "node:test";
import assert from "node:assert/strict";
import { computeJobBackoffSec } from "./jobBackoff";

test("computeJobBackoffSec 单调有上限", () => {
  assert.equal(computeJobBackoffSec(0, 3600), 1);
  assert.ok(computeJobBackoffSec(5, 3600) >= 32);
  assert.equal(computeJobBackoffSec(30, 100), 100);
});

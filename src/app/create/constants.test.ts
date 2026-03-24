import test from "node:test";
import assert from "node:assert/strict";
import { GENDER_OPTIONS } from "./constants";

test("create page gender options remain binary for stage one", () => {
  assert.deepEqual(GENDER_OPTIONS, ["男", "女"]);
});


import test from "node:test";
import assert from "node:assert/strict";
import { playWaitUxSemanticSubline } from "./waitUxCopy";

test("wait UX does not add a generic narrative loading subline", () => {
  assert.equal(playWaitUxSemanticSubline("explore"), null);
  assert.equal(playWaitUxSemanticSubline(null), null);
});

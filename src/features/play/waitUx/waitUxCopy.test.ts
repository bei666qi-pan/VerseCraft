import test from "node:test";
import assert from "node:assert/strict";
import { playWaitUxSemanticSubline } from "./waitUxCopy";

test("wait UX uses neutral realtime world simulation copy", () => {
  assert.equal(playWaitUxSemanticSubline("explore"), "世界正在实时推演");
  assert.equal(playWaitUxSemanticSubline(null), "世界正在实时推演");
});

import assert from "node:assert/strict";
import test from "node:test";
import { hasConcreteNarrativeContent } from "@/lib/perf/chatSseProbe";

test("concrete narrative detection ignores terminal JSON protocol fragments", () => {
  assert.equal(hasConcreteNarrativeContent('{"narrative":"'), false);
  assert.equal(hasConcreteNarrativeContent('{"narrative":"   '), false);
  assert.equal(hasConcreteNarrativeContent('{"narrative":"走'), true);
  assert.equal(hasConcreteNarrativeContent('{"narrative":"\\u8d70'), true);
});

test("concrete narrative detection supports a plain-text compatibility stream", () => {
  assert.equal(hasConcreteNarrativeContent(""), false);
  assert.equal(hasConcreteNarrativeContent("  门外传来脚步声"), true);
});

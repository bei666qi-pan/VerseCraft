import { test } from "node:test";
import assert from "node:assert/strict";
import { computeViewportUnitPx } from "@/components/ViewportRuntimeVars";

test("computeViewportUnitPx prefers visualViewport height", () => {
  assert.equal(computeViewportUnitPx({ visualViewportHeight: 844, innerHeight: 900 }), 8.44);
});

test("computeViewportUnitPx falls back to innerHeight", () => {
  assert.equal(computeViewportUnitPx({ visualViewportHeight: null, innerHeight: 932 }), 9.32);
});

test("computeViewportUnitPx returns null for unusable heights", () => {
  assert.equal(computeViewportUnitPx({ visualViewportHeight: 0, innerHeight: -1 }), null);
});

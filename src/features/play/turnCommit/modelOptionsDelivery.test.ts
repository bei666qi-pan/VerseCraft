import assert from "node:assert/strict";
import test from "node:test";
import { decideModelOptionsDelivery } from "./modelOptionsDelivery";

test("decideModelOptionsDelivery commits exactly four model options", () => {
  const out = decideModelOptionsDelivery({ options: ["a", "b", "c", "d"] });
  assert.deepEqual(out, { action: "commit", options: ["a", "b", "c", "d"] });
});

test("decideModelOptionsDelivery repairs one to three model options", () => {
  const out = decideModelOptionsDelivery({ options: ["a", "b", "c"] });
  assert.deepEqual(out, { action: "repair", seedOptions: ["a", "b", "c"], missingCount: 1 });
});

test("decideModelOptionsDelivery clears empty options instead of keeping stale choices", () => {
  const out = decideModelOptionsDelivery({ options: [] });
  assert.deepEqual(out, { action: "clear" });
});

test("decideModelOptionsDelivery trims invalid entries before deciding", () => {
  const out = decideModelOptionsDelivery({ options: [" a ", "", "b"] });
  assert.deepEqual(out, { action: "repair", seedOptions: ["a", "b"], missingCount: 2 });
});

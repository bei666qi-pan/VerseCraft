import assert from "node:assert/strict";
import test from "node:test";

import { buildBenchmarkClientState } from "@/lib/evals/benchmarkClientState";
import { validateChatRequest } from "@/lib/security/chatValidation";

test("benchmark client state is a valid structured object with no default authority", () => {
  const clientState = buildBenchmarkClientState(undefined);
  assert.equal(typeof clientState, "object");
  assert.equal(clientState.v, 1);
  assert.deepEqual(clientState.inventoryItemIds, []);
  assert.deepEqual(clientState.activeTaskIds, undefined);
  assert.deepEqual(clientState.activeThreatIds, undefined);

  const validated = validateChatRequest({
    messages: [{ role: "user", content: "我检查前方。" }],
    clientState,
  });
  assert.equal(validated.ok, true);
  if (validated.ok) assert.deepEqual(validated.clientState?.inventoryItemIds, []);
});

test("item benchmark grants only its registered fixture inventory", () => {
  const clientState = buildBenchmarkClientState({
    playerLocation: "楼梯间",
    inventoryItemIds: ["I-D14", "I-D46"],
  });
  assert.deepEqual(clientState.inventoryItemIds, ["I-D14", "I-D46"]);
  assert.deepEqual(clientState.warehouseItemIds, []);
  assert.deepEqual(clientState.worldFlags, []);
});

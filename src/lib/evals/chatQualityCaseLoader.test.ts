import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadChatQualityCases } from "./chatQualityCaseLoader";

const root = path.resolve(process.cwd());

test("mock chat quality uses the current compact turn contracts", () => {
  const cases = loadChatQualityCases({ root, mode: "mock" });

  assert.equal(cases.length, 10);
  assert.ok(cases.some((entry) => entry.id === "normal_action"));
  assert.ok(cases.every((entry) => entry.expect.maxNarrativeChars >= 1_200));
  assert.ok(cases.every((entry) => !entry.latestUserInput.includes("[mock_scenario:")));
  assert.ok(cases.every((entry) => entry.mockScenario === "normal_stream"));
  const itemState = cases.find((entry) => entry.id === "item_interaction")?.clientState;
  assert.equal(itemState?.playerLocation, "楼梯间");
  assert.deepEqual(itemState?.inventoryItemIds, ["I-D14", "I-D46"]);
  assert.equal(itemState?.v, 1);
});

test("live chat quality retains the broad player scenario corpus", () => {
  const cases = loadChatQualityCases({ root, mode: "live" });

  assert.equal(cases.length, 121);
  assert.ok(cases.some((entry) => entry.id === "death_ally_sacrifice_001"));
});

import assert from "node:assert/strict";
import test from "node:test";
import { DEEP_SCENARIO_IDS, validateScenarioSelection } from "./deepScenarioMatrix";

test("complete explicit deep matrix passes", () => {
  assert.doesNotThrow(() => validateScenarioSelection({ scenarioIds: [...DEEP_SCENARIO_IDS], knownScenarioIds: DEEP_SCENARIO_IDS, requireDeepCoverage: true }));
});

test("unknown, duplicate and missing required scenarios fail before execution", () => {
  assert.throws(
    () => validateScenarioSelection({ scenarioIds: [DEEP_SCENARIO_IDS[0]!, DEEP_SCENARIO_IDS[0]!, "unknown"], knownScenarioIds: DEEP_SCENARIO_IDS, requireDeepCoverage: true }),
    /未知场景: unknown.*重复场景: combat-survival.*缺失必需能力:/,
  );
});

test("non-deep explicit selection still rejects unknown and duplicate ids", () => {
  assert.throws(() => validateScenarioSelection({ scenarioIds: ["a", "a"], knownScenarioIds: ["a"], requireDeepCoverage: false }), /重复场景/);
  assert.throws(() => validateScenarioSelection({ scenarioIds: ["b"], knownScenarioIds: ["a"], requireDeepCoverage: false }), /未知场景/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildBenchmarkPlayerInput } from "./benchmarkInput";

test("live benchmark input strips an embedded mock marker", () => {
  assert.equal(
    buildBenchmarkPlayerInput({ input: "[mock_scenario:normal_stream] 贴墙前进", mode: "live" }),
    "贴墙前进"
  );
});

test("mock benchmark input keeps exactly one canonical marker", () => {
  assert.equal(
    buildBenchmarkPlayerInput({ input: "[mock_scenario:normal_stream] 贴墙前进", mode: "mock" }),
    "[mock_scenario:normal_stream] 贴墙前进"
  );
});

test("explicit mock scenario overrides an embedded fixture marker", () => {
  assert.equal(
    buildBenchmarkPlayerInput({ input: "[mock_scenario:old] 贴墙前进", mode: "mock", mockScenario: "new" }),
    "[mock_scenario:new] 贴墙前进"
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { traceContentFingerprint } from "./traceIdentity";

const trace = { scenarioId: "s", persona: "p", initialState: { hp: 10 }, steps: [{ playerAction: "走", narrative: "前进" }] };

test("rejudging the same play does not create a new play sample", () => {
  assert.equal(
    traceContentFingerprint({ ...trace, narrativeConsistency: { passed: true } } as typeof trace),
    traceContentFingerprint({ ...trace, narrativeConsistency: { passed: false } } as typeof trace),
  );
});

test("a genuine rerun with different turn content remains distinct", () => {
  assert.notEqual(traceContentFingerprint(trace), traceContentFingerprint({ ...trace, steps: [{ playerAction: "走", narrative: "停下" }] }));
});

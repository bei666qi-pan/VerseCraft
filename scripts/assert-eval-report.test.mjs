import test from "node:test";
import assert from "node:assert/strict";
import { assertEvalReport, getPathValue } from "./assert-eval-report.mjs";

test("getPathValue reads nested fields", () => {
  assert.equal(getPathValue({ summary: { strictGatePass: true } }, "summary.strictGatePass"), true);
  assert.equal(getPathValue({ summary: {} }, "summary.missing"), undefined);
});

test("assertEvalReport accepts passing boolean and equality rules", () => {
  const failures = assertEvalReport(
    { summary: { strictGatePass: true, gate: "pass" }, liveCoverageGatePass: true },
    {
      requireTrue: ["summary.strictGatePass", "liveCoverageGatePass"],
      requireEqual: ["summary.gate=pass"],
    },
  );
  assert.deepEqual(failures, []);
});

test("assertEvalReport reports false-green conditions", () => {
  const failures = assertEvalReport(
    { summary: { strictGatePass: false, gate: "fail" }, liveCoverageGatePass: true },
    {
      requireTrue: ["summary.strictGatePass", "liveCoverageGatePass"],
      requireEqual: ["summary.gate=pass"],
    },
  );
  assert.equal(failures.length, 2);
  assert.match(failures[0] ?? "", /strictGatePass/);
  assert.match(failures[1] ?? "", /summary\.gate/);
});

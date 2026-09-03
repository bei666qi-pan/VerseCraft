import test from "node:test";
import assert from "node:assert/strict";
import {
  assessRequiredReleaseGates,
  requiredGateNames,
} from "./wait-required-release-gates.mjs";

const sha = "a".repeat(40);

function run(name, overrides = {}) {
  return {
    name,
    head_sha: sha,
    event: "push",
    status: "completed",
    conclusion: "success",
    created_at: "2026-09-03T00:00:00Z",
    ...overrides,
  };
}

test("main release requires CI and AI Quality Gate for the exact push SHA", () => {
  assert.deepEqual(requiredGateNames("main"), ["CI", "AI Quality Gate"]);
  assert.deepEqual(
    assessRequiredReleaseGates({ branch: "main", targetSha: sha, runs: [run("CI"), run("AI Quality Gate")] }),
    { ready: true, missing: [], pending: [], failed: [] },
  );
});

test("a successful CI alone can never release main", () => {
  assert.deepEqual(
    assessRequiredReleaseGates({ branch: "main", targetSha: sha, runs: [run("CI")] }),
    { ready: false, missing: ["AI Quality Gate"], pending: [], failed: [] },
  );
});

test("a failed AI gate blocks release even when CI passes", () => {
  assert.deepEqual(
    assessRequiredReleaseGates({
      branch: "main",
      targetSha: sha,
      runs: [run("CI"), run("AI Quality Gate", { conclusion: "failure" })],
    }),
    { ready: false, missing: [], pending: [], failed: ["AI Quality Gate:failure"] },
  );
});

test("runs from a different SHA or non-push event cannot satisfy the gate", () => {
  const result = assessRequiredReleaseGates({
    branch: "main",
    targetSha: sha,
    runs: [
      run("CI", { head_sha: "b".repeat(40) }),
      run("AI Quality Gate", { event: "workflow_dispatch" }),
    ],
  });
  assert.deepEqual(result.missing, ["CI", "AI Quality Gate"]);
  assert.equal(result.ready, false);
});

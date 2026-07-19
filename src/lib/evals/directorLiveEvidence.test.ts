import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDirectorLiveEvidence, type DirectorEvidenceResult } from "@/lib/evals/directorLiveEvidence";

const allPassing: DirectorEvidenceResult[] = [
  "preflight", "enqueued", "worker", "reasoner_run", "agenda", "director_state", "consumer",
].map((stage) => ({ stage: stage as DirectorEvidenceResult["stage"], status: "pass", detail: "ok" }));

test("director evidence passes only with every queue-to-consumer stage", () => {
  assert.deepEqual(summarizeDirectorLiveEvidence(allPassing), { status: "pass", missingStages: [], results: allPassing });
});

test("unavailable database remains blocked rather than a director pass", () => {
  const summary = summarizeDirectorLiveEvidence([{ stage: "preflight", status: "blocked", detail: "DATABASE_URL missing" }]);
  assert.equal(summary.status, "blocked");
  assert.ok(summary.missingStages.includes("worker"));
});

test("failed worker cannot be masked by a successful enqueue", () => {
  const results = allPassing.map((result) => result.stage === "worker" ? { ...result, status: "fail" as const, detail: "exit 1" } : result);
  const summary = summarizeDirectorLiveEvidence(results);
  assert.equal(summary.status, "fail");
  assert.deepEqual(summary.missingStages, ["worker"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("standalone worker loads the local runtime configuration before reading worker env", () => {
  const worker = readFileSync("scripts/vc-worker.ts", "utf8");
  const dotenvIndex = worker.indexOf('dotenvConfig({ path: resolve(".env.local"), quiet: true })');
  const workerTargetIndex = worker.indexOf("parseWorkerTargetJobId(process.env.VC_WORKER_ONLY_JOB_ID)");

  assert.ok(dotenvIndex >= 0, "worker must load .env.local when started outside Next.js");
  assert.ok(workerTargetIndex >= 0, "worker target selection must remain environment-configured");
  assert.ok(dotenvIndex < workerTargetIndex, "configuration must load before worker environment is read");
  assert.match(worker, /selectWorkerJobs\(\{ targetJobId, targetedJob, claimedBatch \}\)/);
});

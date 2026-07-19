import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("director probe runs a worker targeted at its own persisted job", () => {
  const script = readFileSync("scripts/probe-world-director-live.ts", "utf8");
  assert.match(script, /VC_WORKER_ONLY_JOB_ID/);
  assert.match(script, /runWorkerOnce\(jobId/);
  assert.match(script, /targetJobId: number/);
});

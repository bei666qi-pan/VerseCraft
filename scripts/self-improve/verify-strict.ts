#!/usr/bin/env tsx
/**
 * Strict Completion Gate — CLI
 *
 * Usage:
 *   pnpm self-improve:verify:strict -- --run-id <runId>
 *
 * Returns exit code 0 ONLY if strict verification passes.
 * Never trusts self-declared status.
 */

import { runStrictVerification } from "../../src/lib/evals/selfImprove/strictVerifier";
import { resolve } from "node:path";

function parseArgs(): { runId: string } {
  const args = process.argv.slice(2);
  let runId = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-id") runId = args[++i] || "";
  }
  if (!runId) {
    console.error("Usage: pnpm self-improve:verify:strict -- --run-id <runId>");
    process.exit(2);
  }
  return { runId };
}

const { runId } = parseArgs();
const runDir = `.runtime-data/self-improve/${runId}`;

console.log(`Strict verification of run: ${runId}`);
console.log(`Artifacts dir: ${resolve(process.cwd(), runDir)}`);
console.log("");

const result = runStrictVerification(runDir);

console.log(JSON.stringify({
  passed: result.passed,
  status: result.status,
  reasons: result.reasons,
  metrics: result.metrics,
  verifiedDefects: result.verifiedDefects,
  unresolvedDefects: result.unresolvedDefects,
}, null, 2));

process.exit(result.exitCode);

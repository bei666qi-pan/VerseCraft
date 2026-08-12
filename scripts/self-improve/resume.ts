#!/usr/bin/env tsx
/**
 * Evaluation & Regression Campaign — Legacy Resume
 *
 * Resumes an interrupted self-improvement run from its saved state.
 *
 * Usage:
 *   pnpm self-improve:resume -- --run-id si-20260730-120000
 */

import { resumeFrom, getState, saveState } from "../../src/lib/evals/selfImprove/stateMachine";
import { runSelfImprovement } from "../../src/lib/evals/selfImprove/orchestrator";
import type { SelfImproveProfile } from "../../src/lib/evals/selfImprove/types";

function parseArgs(): { runId: string } {
  const args = process.argv.slice(2);
  let runId = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-id") {
      runId = args[++i] || "";
    }
  }

  if (!runId) {
    console.error("Usage: pnpm self-improve:resume -- --run-id <runId>");
    process.exit(1);
  }

  return { runId };
}

async function main(): Promise<void> {
  const { runId } = parseArgs();

  console.log("=".repeat(50));
  console.log(`Resuming self-improvement run: ${runId}`);
  console.log("=".repeat(50));

  // Restore state
  const state = resumeFrom(runId);
  console.log(`Resumed at round ${state.currentRound}/${state.budget.maxRounds}`);
  console.log(`Phase: ${state.phase}`);
  console.log(`Profile: ${state.runId.profile}`);

  // Continue from current phase
  const report = await runSelfImprovement({
    profile: state.runId.profile,
    dryRun: false,
    maxRounds: state.budget.maxRounds,
  });

  console.log(`\nResumed run completed. Status: ${report.status}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});

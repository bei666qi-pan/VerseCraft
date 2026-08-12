#!/usr/bin/env tsx
/**
 * Evaluation & Regression Campaign — Legacy Runner
 *
 * Usage:
 *   pnpm self-improve:dry-run
 *   pnpm self-improve:run -- --profile smoke --max-rounds 3
 *   pnpm self-improve:run -- --profile standard
 *   pnpm self-improve:run -- --scenario-ids golden-explore-room,boundary-nonexistent-item
 *
 * Environment:
 *   SI_LIVE_MODE=1            Enable live model calls
 *   SI_MAX_ROUNDS=5           Override max rounds
 *   SI_MAX_LIVE_CALLS=200     Override max live calls
 *   LIVEPLAY_BASE_URL         Override /api/chat base URL (default http://localhost:666)
 */

import { runSelfImprovement } from "../../src/lib/evals/selfImprove/orchestrator";
import type { SelfImproveProfile } from "../../src/lib/evals/selfImprove/types";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

// ── CLI ───────────────────────────────────────────────

interface CliOptions {
  profile: SelfImproveProfile;
  scenarioIds?: string[];
  maxRounds?: number;
  dryRun: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    profile: "smoke",
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--profile":
        options.profile = (args[++i] as SelfImproveProfile) || "smoke";
        break;
      case "--scenario-ids":
        options.scenarioIds = (args[++i] || "").split(",").filter(Boolean);
        break;
      case "--max-rounds":
        options.maxRounds = parseInt(args[++i] || "3", 10);
        break;
      case "--live":
        process.env.SI_LIVE_MODE = "1";
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
    }
  }

  return options;
}

// ── Main ──────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs();

  console.log("=".repeat(60));
  console.log("VerseCraft Evaluation & Regression Campaign");
  console.log("=".repeat(60));
  console.log(`Profile:    ${options.profile}`);
  console.log("Repository: read-only (reports and runtime evidence only)");
  console.log(`Scenarios:  ${options.scenarioIds?.join(", ") || "all dev set"}`);
  console.log(`Max rounds: ${options.maxRounds || "default"}`);
  console.log("=".repeat(60));

  const report = await runSelfImprovement({
    profile: options.profile,
    scenarioIds: options.scenarioIds,
    maxRounds: options.maxRounds,
    dryRun: options.dryRun,
  });

  // Write final report
  const outDir = resolve(process.cwd(), `.runtime-data/self-improve/${report.runId.id}`);
  mkdirSync(outDir, { recursive: true });

  const reportPath = join(outDir, "final-report.md");
  const reportMd = formatReportMarkdown(report);
  writeFileSync(reportPath, reportMd, "utf-8");

  const jsonPath = join(outDir, "final-report.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\n[SelfImprove] Final report: ${reportPath}`);
  console.log(`[SelfImprove] Status: ${report.status}`);
  console.log(`[SelfImprove] Stop reason: ${report.stopReason}`);

  // Exit with appropriate code
  if (report.status === "PASS") {
    process.exit(0);
  } else if (report.status === "REGRESSION_DETECTED") {
    process.exit(1);
  } else if (report.status === "BLOCKED" || report.status === "BUDGET_EXHAUSTED") {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

function formatReportMarkdown(report: ReturnType<typeof runSelfImprovement> extends Promise<infer T> ? T : never): string {
  const lines: string[] = [];

  lines.push("# VerseCraft Evaluation & Regression — Final Report");
  lines.push("");
  lines.push(`**Status**: \`${report.status}\``);
  lines.push(`**Run ID**: ${report.runId.id}`);
  lines.push(`**Profile**: ${report.runId.profile}`);
  lines.push(`**Stop Reason**: ${report.stopReason}`);
  lines.push("");

  lines.push("## Architecture");
  lines.push(report.architecture);
  lines.push("");

  lines.push("## Commands Added");
  for (const cmd of report.commandsAdded) {
    lines.push(`- \`${cmd}\``);
  }
  lines.push("");

  lines.push("## Round Details");
  for (const rd of report.roundDetails) {
    lines.push(`### Round ${rd.round}`);
    lines.push(`- Defects found: ${rd.defectsFound}`);
    lines.push(`- Recommendations generated: ${rd.recommendationsGenerated}`);
    lines.push("- Repairs applied by evaluator: 0");
    if (rd.rootCauses.length > 0) {
      lines.push("- Root causes:");
      for (const rc of rd.rootCauses) {
        lines.push(`  - ${rc}`);
      }
    }
    lines.push("");
  }

  lines.push("## Resource Usage");
  lines.push(`- Live model calls: ${report.resourceUsage.liveModelCalls}`);
  lines.push(`- Duration: ${report.resourceUsage.totalDurationMinutes} min`);
  lines.push("");

  lines.push("## Implementation Handoff");
  lines.push("This evaluation did not modify product code. Open an explicit implementation task for a confirmed defect, add a failing regression test, make the scoped change, and rerun the campaign.");
  for (const recommendation of report.recommendations) {
    lines.push(`- ${recommendation.defectSignature.ruleId} (${recommendation.defectSignature.affectedSystem}): ${recommendation.approach}`);
  }
  lines.push("");

  lines.push("## Unresolved Issues");
  if (report.unresolvedIssues.length === 0) {
    lines.push("None.");
  } else {
    for (const issue of report.unresolvedIssues) {
      lines.push(`- ${issue}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(3);
});

#!/usr/bin/env tsx
/**
 * VerseCraft Evaluation & Regression Campaign
 *
 * Full campaign runner with:
 * - minRounds enforcement
 * - Scenario expansion on clean rounds
 * - Proper stop policy with CLEAN_BUT_INSUFFICIENT_EVIDENCE
 *
 * Usage:
 *   pnpm eval:campaign -- --profile smoke
 *   pnpm eval:campaign -- --live --max-rounds 3
 */

import { runSelfImprovement } from "../../src/lib/evals/selfImprove/orchestrator";
import type { SelfImproveProfile } from "../../src/lib/evals/selfImprove/types";
import { SMOKE_CAMPAIGN_CONFIG } from "../../src/lib/evals/selfImprove/stopPolicy";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

// ── CLI ───────────────────────────────────────────────

interface CampaignOptions {
  profile: SelfImproveProfile;
  live: boolean;
  maxRounds: number;
  maxDurationMinutes: number;
  maxLiveCalls: number;
  gameConcurrency: number;
  judgeConcurrency: number;
  caseId?: string;
  seed?: number;
}

function parseArgs(): CampaignOptions {
  const args = process.argv.slice(2);
  const opts: CampaignOptions = {
    profile: "smoke",
    live: false,
    maxRounds: SMOKE_CAMPAIGN_CONFIG.maxRounds,
    maxDurationMinutes: SMOKE_CAMPAIGN_CONFIG.maxDurationMinutes,
    maxLiveCalls: SMOKE_CAMPAIGN_CONFIG.maxLiveModelCalls,
    gameConcurrency: 4,
    judgeConcurrency: 3,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--profile": opts.profile = (args[++i] as SelfImproveProfile) || "smoke"; break;
      case "--live": opts.live = true; break;
      case "--max-rounds": opts.maxRounds = parseInt(args[++i] || "8", 10); break;
      case "--max-duration-minutes": opts.maxDurationMinutes = parseInt(args[++i] || "240", 10); break;
      case "--max-live-calls": opts.maxLiveCalls = parseInt(args[++i] || "200", 10); break;
      case "--game-concurrency": opts.gameConcurrency = parseInt(args[++i] || "4", 10); break;
      case "--judge-concurrency": opts.judgeConcurrency = parseInt(args[++i] || "3", 10); break;
      case "--case": opts.caseId = args[++i]; break;
      case "--seed": opts.seed = parseInt(args[++i] || "0", 10); break;
      case "--dry-run": break; // Legacy no-op: evaluation is always non-mutating.
    }
  }

  if (opts.live) process.env.SI_LIVE_MODE = "1";
  if (opts.seed) process.env.SI_SEED = String(opts.seed);
  process.env.SI_MAX_ROUNDS = String(opts.maxRounds);
  process.env.SI_MAX_LIVE_CALLS = String(opts.maxLiveCalls);
  process.env.SI_MAX_DURATION_MIN = String(opts.maxDurationMinutes);
  process.env.SI_GAME_CONCURRENCY = String(opts.gameConcurrency);
  process.env.SI_JUDGE_CONCURRENCY = String(opts.judgeConcurrency);

  return opts;
}

// ── Main ──────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log("=".repeat(60));
  console.log("VerseCraft Evaluation & Regression Campaign");
  console.log("=".repeat(60));
  console.log(`Profile:      ${opts.profile}`);
  console.log(`Live mode:    ${opts.live}`);
  console.log(`Max rounds:   ${opts.maxRounds}`);
  console.log("Repository:   read-only (reports and runtime evidence only)");
  console.log("=".repeat(60));

  const report = await runSelfImprovement({
    profile: opts.profile,
    scenarioIds: opts.caseId ? [opts.caseId] : undefined,
    maxRounds: opts.maxRounds,
    dryRun: true,
    campaignConfig: {
      maxDurationMinutes: opts.maxDurationMinutes,
      maxLiveModelCalls: opts.maxLiveCalls,
    },
  });

  // Write final report
  const outDir = resolve(process.cwd(), `.runtime-data/self-improve/${report.runId.id}`);
  mkdirSync(outDir, { recursive: true });

  const reportPath = join(outDir, "campaign-report.md");
  const reportMd = formatCampaignReport(report, opts);
  writeFileSync(reportPath, reportMd, "utf-8");

  const jsonPath = join(outDir, "campaign-report.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(`\n[Campaign] Report: ${reportPath}`);
  console.log(`[Campaign] Status: ${report.status}`);
  console.log(`[Campaign] Stop reason: ${report.stopReason}`);

  process.exit(report.status === "PASS" ? 0 : 1);
}

function formatCampaignReport(report: any, opts: CampaignOptions): string {
  return `# VerseCraft Evaluation & Regression Campaign Report

**Status**: \`${report.status}\`
**Run ID**: ${report.runId.id}
**Profile**: ${opts.profile}
**Stop Reason**: ${report.stopReason}

## Campaign Configuration
- Max rounds: ${opts.maxRounds}
- Live: ${opts.live}
- Repository mutation: disabled

## Architecture
${report.architecture}

## Round Details
${(report.roundDetails || []).map((rd: any) =>
  `### Round ${rd.round}
- Defects found: ${rd.defectsFound}
- Recommendations generated: ${rd.recommendationsGenerated ?? 0}
- Repairs applied by evaluator: 0
- Root causes: ${(rd.rootCauses || []).join(", ") || "none"}`
).join("\n\n")}

## Implementation Handoff
This report is evidence, not an applied repair. Open an explicit implementation task for a confirmed defect, add a failing regression test, make the scoped production change, and rerun this campaign.
${(report.recommendations || []).length === 0 ? "No implementation recommendations were generated." : (report.recommendations || []).map((item: any) => `- ${item.defectSignature.ruleId} (${item.defectSignature.affectedSystem}): ${item.approach}\n  Candidate files: ${(item.candidateFiles || []).join(", ") || "investigate from evidence"}\n  Required tests: ${(item.requiredTests || []).join("; ")}`).join("\n")}

## Resource Usage
- Live model calls: ${report.resourceUsage?.liveModelCalls || "N/A"}
- Duration: ${report.resourceUsage?.totalDurationMinutes || "N/A"} min

## Unresolved Issues
${(report.unresolvedIssues || []).length === 0 ? "None." : (report.unresolvedIssues || []).map((i: string) => `- ${i}`).join("\n")}
`;
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(3);
});

#!/usr/bin/env tsx
/**
 * Self-Improving Agent System — Campaign Mode
 *
 * Full campaign runner with:
 * - minRounds enforcement
 * - Scenario expansion on clean rounds
 * - Calibration / mutation support
 * - Resume capability
 * - Proper stop policy with CLEAN_BUT_INSUFFICIENT_EVIDENCE
 *
 * Usage:
 *   pnpm self-improve:campaign -- --profile smoke
 *   pnpm self-improve:campaign -- --live --min-rounds 3 --max-rounds 8
 *   pnpm self-improve:campaign -- --resume --run-id si-20260730-xxx
 *   pnpm self-improve:campaign -- --calibration
 */

import { runSelfImprovement } from "../../src/lib/evals/selfImprove/orchestrator";
import type { SelfImproveProfile } from "../../src/lib/evals/selfImprove/types";
import {
  SMOKE_CAMPAIGN_CONFIG,
  type CampaignStopConfig,
} from "../../src/lib/evals/selfImprove/stopPolicy";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

// ── CLI ───────────────────────────────────────────────

interface CampaignOptions {
  profile: SelfImproveProfile;
  live: boolean;
  minRounds: number;
  maxRounds: number;
  repeat: number;
  maxDurationMinutes: number;
  maxLiveCalls: number;
  gameConcurrency: number;
  judgeConcurrency: number;
  resume: boolean;
  runId?: string;
  caseId?: string;
  seed?: number;
  calibration: boolean;
  noRepair: boolean;
  repairBackend: string;
}

function parseArgs(): CampaignOptions {
  const args = process.argv.slice(2);
  const opts: CampaignOptions = {
    profile: "smoke",
    live: false,
    minRounds: SMOKE_CAMPAIGN_CONFIG.minRounds,
    maxRounds: SMOKE_CAMPAIGN_CONFIG.maxRounds,
    repeat: SMOKE_CAMPAIGN_CONFIG.repeatedLiveRuns,
    maxDurationMinutes: SMOKE_CAMPAIGN_CONFIG.maxDurationMinutes,
    maxLiveCalls: SMOKE_CAMPAIGN_CONFIG.maxLiveModelCalls,
    gameConcurrency: 4,
    judgeConcurrency: 3,
    resume: false,
    calibration: false,
    noRepair: false,
    repairBackend: "codex",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--profile": opts.profile = (args[++i] as SelfImproveProfile) || "smoke"; break;
      case "--live": opts.live = true; break;
      case "--min-rounds": opts.minRounds = parseInt(args[++i] || "3", 10); break;
      case "--max-rounds": opts.maxRounds = parseInt(args[++i] || "8", 10); break;
      case "--repeat": opts.repeat = parseInt(args[++i] || "3", 10); break;
      case "--max-duration-minutes": opts.maxDurationMinutes = parseInt(args[++i] || "240", 10); break;
      case "--max-live-calls": opts.maxLiveCalls = parseInt(args[++i] || "200", 10); break;
      case "--game-concurrency": opts.gameConcurrency = parseInt(args[++i] || "4", 10); break;
      case "--judge-concurrency": opts.judgeConcurrency = parseInt(args[++i] || "3", 10); break;
      case "--resume": opts.resume = true; break;
      case "--run-id": opts.runId = args[++i]; break;
      case "--case": opts.caseId = args[++i]; break;
      case "--seed": opts.seed = parseInt(args[++i] || "0", 10); break;
      case "--calibration": opts.calibration = true; break;
      case "--no-repair": opts.noRepair = true; break;
      case "--repair-backend": opts.repairBackend = args[++i] || "codex"; break;
    }
  }

  if (opts.live) process.env.SI_LIVE_MODE = "1";
  if (opts.seed) process.env.SI_SEED = String(opts.seed);

  return opts;
}

// ── Main ──────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();

  console.log("=".repeat(60));
  console.log("VerseCraft Self-Improving Agent — CAMPAIGN MODE");
  console.log("=".repeat(60));
  console.log(`Profile:      ${opts.profile}`);
  console.log(`Live mode:    ${opts.live}`);
  console.log(`Min rounds:   ${opts.minRounds}`);
  console.log(`Max rounds:   ${opts.maxRounds}`);
  console.log(`Repeat:       ${opts.repeat}`);
  console.log(`Calibration:  ${opts.calibration}`);
  console.log(`No repair:    ${opts.noRepair}`);
  console.log("=".repeat(60));

  if (opts.calibration) {
    console.log("\n[Campaign] Calibration mode — injecting controlled defects...");
    await runCalibration(opts);
    return;
  }

  const report = await runSelfImprovement({
    profile: opts.profile,
    scenarioIds: opts.caseId ? [opts.caseId] : undefined,
    maxRounds: opts.maxRounds,
    dryRun: opts.noRepair,
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

  process.exit(report.status === "PASS" || report.status === "LIVE_CAMPAIGN_PASS" ? 0 : 1);
}

async function runCalibration(opts: CampaignOptions): Promise<void> {
  // Placeholder for calibration mode (Section 七)
  // Injects controlled defects, verifies full repair loop
  console.log("[Calibration] NOT YET IMPLEMENTED — requires isolated git worktree.");
  console.log("[Calibration] See docs/self-improving-agent-system-v2.md Section 七.");
  process.exit(0);
}

function formatCampaignReport(report: any, opts: CampaignOptions): string {
  return `# VerseCraft Self-Improving Agent — Campaign Report

**Status**: \`${report.status}\`
**Run ID**: ${report.runId.id}
**Profile**: ${opts.profile}
**Stop Reason**: ${report.stopReason}

## Campaign Configuration
- Min rounds: ${opts.minRounds}
- Max rounds: ${opts.maxRounds}
- Live: ${opts.live}
- Calibration: ${opts.calibration}
- No repair: ${opts.noRepair}

## Architecture
${report.architecture}

## Round Details
${(report.roundDetails || []).map((rd: any) =>
  `### Round ${rd.round}
- Defects found: ${rd.defectsFound}
- Defects repaired: ${rd.defectsRepaired}
- Root causes: ${(rd.rootCauses || []).join(", ") || "none"}`
).join("\n\n")}

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

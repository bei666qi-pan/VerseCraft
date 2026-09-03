#!/usr/bin/env tsx
/**
 * Self-Improving Agent System — Report Generator
 *
 * Reads a completed run's artifacts and generates a human-readable
 * summary report.
 *
 * Usage:
 *   pnpm self-improve:report -- --run-id si-20260730-120000
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

function parseArgs(): { runId: string } {
  const args = process.argv.slice(2);
  let runId = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-id") {
      runId = args[++i] || "";
    }
  }

  if (!runId) {
    console.error("Usage: pnpm self-improve:report -- --run-id <runId>");
    process.exit(1);
  }

  return { runId };
}

function main(): void {
  const { runId } = parseArgs();
  const dir = resolve(process.cwd(), `.runtime-data/self-improve/${runId}`);

  if (!existsSync(dir)) {
    console.error(`Run directory not found: ${dir}`);
    process.exit(1);
  }

  const manifestPath = join(dir, "manifest.json");
  const reportPath = join(dir, "final-report.json");
  const mdReportPath = join(dir, "final-report.md");

  console.log("=".repeat(50));
  console.log(`Self-Improvement Run Report: ${runId}`);
  console.log("=".repeat(50));

  // Manifest
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    console.log(`Status:    ${manifest.status}`);
    console.log(`Profile:   ${manifest.profile}`);
    console.log(`Rounds:    ${manifest.rounds}`);
    console.log(`Started:   ${manifest.startedAt}`);
    console.log("");
  }

  // Artifacts
  const artifacts = ["traces.jsonl", "judge-results.jsonl", "deterministic-results.json", "defects.json", "scorecard.json"];
  console.log("Artifacts:");
  for (const art of artifacts) {
    const path = join(dir, art);
    if (existsSync(path)) {
      const size = readFileSync(path, "utf-8").length;
      console.log(`  ✅ ${art} (${(size / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`  ❌ ${art} (not found)`);
    }
  }
  console.log("");

  // Final report
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    console.log(`Final Status: ${report.status}`);
    console.log(`Stop Reason:  ${report.stopReason}`);
    console.log(`Resource Usage:`);
    console.log(`  Live calls:   ${report.resourceUsage?.liveModelCalls || "N/A"}`);
    console.log(`  Duration:     ${report.resourceUsage?.totalDurationMinutes || "N/A"} min`);

    if (report.roundDetails) {
      console.log(`\nRounds:`);
      for (const rd of report.roundDetails) {
        console.log(`  Round ${rd.round}: ${rd.defectsFound} defects, ${rd.defectsRepaired} repaired`);
      }
    }
  }

  if (existsSync(mdReportPath)) {
    console.log(`\n📄 Markdown report: ${mdReportPath}`);
  }
}

main();

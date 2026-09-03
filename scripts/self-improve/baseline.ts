#!/usr/bin/env tsx
/**
 * Self-Improving Agent System — Baseline Runner
 *
 * Runs the current test suites to establish a quality baseline
 * before any self-improvement modifications are made.
 *
 * Usage:
 *   pnpm self-improve:baseline
 *   pnpm self-improve:baseline -- --out .runtime-data/self-improve/baseline.json
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

interface BaselineResult {
  timestamp: string;
  commit: string;
  mode: string;
  suites: Record<string, { pass: number; fail: number; total: number; passRate: number }>;
  overall: { pass: number; fail: number; total: number; passRate: number };
}

async function main(): Promise<void> {
  const outPath = process.argv.includes("--out")
    ? process.argv[process.argv.indexOf("--out") + 1] || ".runtime-data/self-improve/baseline.json"
    : ".runtime-data/self-improve/baseline.json";

  const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();

  console.log("=".repeat(50));
  console.log("VerseCraft Self-Improve — Baseline");
  console.log(`Commit: ${commit}`);
  console.log("=".repeat(50));

  const suites: Record<string, { pass: number; fail: number; total: number }> = {};

  // Run each test suite
  const suiteCommands: [string, string][] = [
    ["judge", "pnpm test:judge"],
    ["taskEval", "pnpm test:task-eval"],
    ["playthrough", "pnpm test:playthrough"],
    ["redTeam", "pnpm test:red-team"],
  ];

  for (const [name, command] of suiteCommands) {
    console.log(`\nRunning ${name}...`);
    try {
      const output = execSync(command, { encoding: "utf-8", stdio: "pipe", timeout: 60_000 });
      const passMatch = output.match(/ℹ pass (\d+)/);
      const failMatch = output.match(/ℹ fail (\d+)/);
      const testsMatch = output.match(/ℹ tests (\d+)/);

      const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
      const fail = failMatch ? parseInt(failMatch[1], 10) : 0;
      const total = testsMatch ? parseInt(testsMatch[1], 10) : pass + fail;

      suites[name] = { pass, fail, total };
      console.log(`  ${name}: ${pass}/${total} pass, ${fail} fail`);
    } catch (error) {
      const errOutput = error instanceof Error ? error.message : String(error);
      const failMatch = errOutput.match(/ℹ fail (\d+)/);
      const passMatch = errOutput.match(/ℹ pass (\d+)/);
      const testsMatch = errOutput.match(/ℹ tests (\d+)/);

      const fail = failMatch ? parseInt(failMatch[1], 10) : 1;
      const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
      const total = testsMatch ? parseInt(testsMatch[1], 10) : pass + fail;

      suites[name] = { pass, fail, total };
      console.log(`  ${name}: ${pass}/${total} pass, ${fail} fail (ERROR)`);
    }
  }

  // Calculate overall
  let totalPass = 0, totalFail = 0, totalTests = 0;
  for (const suite of Object.values(suites)) {
    totalPass += suite.pass;
    totalFail += suite.fail;
    totalTests += suite.total;
  }

  const baseline: BaselineResult = {
    timestamp: new Date().toISOString(),
    commit,
    mode: "mock",
    suites: Object.fromEntries(
      Object.entries(suites).map(([k, v]) => [
        k,
        { ...v, passRate: v.total > 0 ? v.pass / v.total : 0 },
      ]),
    ),
    overall: {
      pass: totalPass,
      fail: totalFail,
      total: totalTests,
      passRate: totalTests > 0 ? totalPass / totalTests : 0,
    },
  };

  const fullPath = resolve(process.cwd(), outPath);
  mkdirSync(resolve(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, JSON.stringify(baseline, null, 2), "utf-8");

  console.log(`\nBaseline saved: ${fullPath}`);
  console.log(`Overall: ${totalPass}/${totalTests} pass (${(baseline.overall.passRate * 100).toFixed(1)}%)`);

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});

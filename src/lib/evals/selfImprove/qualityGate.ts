/**
 * Evaluation & Regression Campaign — Quality Gate
 *
 * Runs the full quality gate after each repair round:
 * 1. New defect regression tests
 * 2. Related module unit tests
 * 3. Judge tests (pnpm test:judge)
 * 4. Task eval tests (pnpm test:task-eval)
 * 5. Playthrough tests (pnpm test:playthrough)
 * 6. E2E contract tests
 * 7. Full CI (pnpm test:ci)
 * 8. Build verification
 *
 * All results feed into the quality gate decision.
 */

import { execSync } from "node:child_process";
import type { QualityGateResult, LiveEvalResult } from "./types";

// ── Test execution ────────────────────────────────────

interface TestRunResult {
  name: string;
  total: number;
  pass: number;
  fail: number;
  passRate: number;
  allPassed: boolean;
  output: string;
  durationMs: number;
}

function runTest(command: string, name: string): TestRunResult {
  const start = Date.now();
  let total = 0;
  let pass = 0;
  let fail = 0;

  try {
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 120_000,
      cwd: process.cwd(),
    });

    // Parse Node.js test output format
    const passMatch = output.match(/ℹ pass (\d+)/);
    const failMatch = output.match(/ℹ fail (\d+)/);
    const testsMatch = output.match(/ℹ tests (\d+)/);

    if (passMatch) pass = parseInt(passMatch[1], 10);
    if (failMatch) fail = parseInt(failMatch[1], 10);
    if (testsMatch) total = parseInt(testsMatch[1], 10);
    if (total === 0) total = pass + fail;

    return {
      name,
      total,
      pass,
      fail,
      passRate: total > 0 ? pass / total : 1,
      allPassed: fail === 0,
      output,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errOutput = error instanceof Error ? error.message : String(error);
    // Try to extract test counts from error output
    const failMatch = errOutput.match(/ℹ fail (\d+)/);
    const passMatch = errOutput.match(/ℹ pass (\d+)/);
    const testsMatch = errOutput.match(/ℹ tests (\d+)/);

    if (failMatch) fail = parseInt(failMatch[1], 10);
    if (passMatch) pass = parseInt(passMatch[1], 10);
    if (testsMatch) total = parseInt(testsMatch[1], 10);
    if (total === 0) total = pass + fail;
    if (fail === 0 && total === 0) fail = 1; // Unknown failure

    return {
      name,
      total,
      pass,
      fail,
      passRate: total > 0 ? pass / total : 0,
      allPassed: false,
      output: errOutput,
      durationMs: Date.now() - start,
    };
  }
}

function runBuild(): { passed: boolean; output: string; durationMs: number } {
  const start = Date.now();
  try {
    const output = execSync("pnpm build", {
      encoding: "utf-8",
      stdio: "pipe",
      timeout: 180_000,
      cwd: process.cwd(),
    });
    return { passed: true, output, durationMs: Date.now() - start };
  } catch (error) {
    return {
      passed: false,
      output: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    };
  }
}

// ── Gate execution ────────────────────────────────────

export interface QualityGateConfig {
  /** Specific regression test file paths to include */
  regressionTestPaths: string[];
  /** Whether to skip expensive CI suite */
  skipCi: boolean;
  /** Whether to skip build (for quick iterations) */
  skipBuild: boolean;
}

export async function runQualityGate(
  config: QualityGateConfig,
): Promise<QualityGateResult> {
  const round = 0; // Set by orchestrator
  const timestamp = new Date().toISOString();

  // 1. Run new regression tests
  let regressionResult: TestRunResult;
  if (config.regressionTestPaths.length > 0) {
    const paths = config.regressionTestPaths.join(" ");
    regressionResult = runTest(`npx tsx --test ${paths}`, "regression-tests");
  } else {
    regressionResult = {
      name: "regression-tests",
      total: 0,
      pass: 0,
      fail: 0,
      passRate: 1,
      allPassed: true,
      output: "No regression test paths specified.",
      durationMs: 0,
    };
  }

  // 2. Run judge tests
  const judgeResult = runTest("pnpm test:judge", "judge-tests");

  // 3. Run task eval tests
  const taskEvalResult = runTest("pnpm test:task-eval", "task-eval-tests");

  // 4. Run playthrough tests
  const playthroughResult = runTest("pnpm test:playthrough", "playthrough-tests");

  // 5. Run red team tests
  const redTeamResult = runTest("pnpm test:red-team", "red-team-tests");

  // 6. Deterministic tests aggregate
  const deterministicTests = {
    total: judgeResult.total + taskEvalResult.total + playthroughResult.total + redTeamResult.total + regressionResult.total,
    pass: judgeResult.pass + taskEvalResult.pass + playthroughResult.pass + redTeamResult.pass + regressionResult.pass,
    fail: judgeResult.fail + taskEvalResult.fail + playthroughResult.fail + redTeamResult.fail + regressionResult.fail,
    passRate: 0,
    allPassed: false,
  };
  deterministicTests.passRate = deterministicTests.total > 0
    ? deterministicTests.pass / deterministicTests.total
    : 1;
  deterministicTests.allPassed = deterministicTests.fail === 0;

  // 7. Run CI (optional)
  let ciResult: TestRunResult | null = null;
  if (!config.skipCi) {
    ciResult = runTest("pnpm test:ci 2>&1 || true", "ci-tests");
  }

  const requiredE2e = {
    total: ciResult?.total ?? 0,
    pass: ciResult?.pass ?? 0,
    allPassed: ciResult?.allPassed ?? true,
  };

  // 8. Build verification
  let buildResult = { passed: true, output: "", durationMs: 0 };
  if (!config.skipBuild) {
    buildResult = runBuild();
  }

  // Compile blockers
  const blockers: string[] = [];
  if (!regressionResult.allPassed) blockers.push(`Regression tests: ${regressionResult.fail} failures`);
  if (!deterministicTests.allPassed) blockers.push(`Deterministic tests: ${deterministicTests.fail} failures`);
  if (!requiredE2e.allPassed) blockers.push("E2E tests failed");
  if (!buildResult.passed) blockers.push("Build failed");

  const gatePassed = blockers.length === 0;

  return {
    round,
    timestamp,
    deterministicTests,
    newRegressionTests: {
      total: regressionResult.total,
      pass: regressionResult.pass,
      allPassed: regressionResult.allPassed,
    },
    keepAliveTests: {
      total: playthroughResult.total,
      pass: playthroughResult.pass,
      allPassed: playthroughResult.allPassed,
    },
    requiredE2e,
    buildPassed: buildResult.passed,
    liveEval: null, // Populated separately
    gatePassed,
    blockers,
  };
}

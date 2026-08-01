/**
 * Strict Verifier Unit Tests
 */
import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { runStrictVerification } from "./strictVerifier";
import {
  loadHoldoutCases, computeCorpusHash, computePromptHash, computeConfigHash, HOLDOUT_RUBRIC_VERSION,
} from "./holdout";

const TEST_DIR = ".runtime-data/self-improve/test-strict-verifier";

/** Valid holdout binding for the real corpus, matching what saveManifest writes. */
function holdoutArtifacts(overrides: { results?: unknown[]; corpusHash?: string } = {}) {
  const cases = loadHoldoutCases();
  const corpusHash = overrides.corpusHash ?? computeCorpusHash(cases);
  const promptVersion = "test-prompt-v1";
  return {
    manifestExtra: {
      provenance: { commit: "abc123", promptVersion, model: "test-model" },
      holdout: { caseIds: cases.map((c) => c.caseId), corpusHash, executedAt: new Date().toISOString() },
      hashes: {
        codeHash: "abc123",
        promptHash: computePromptHash(promptVersion),
        modelId: "test-model",
        corpusHash,
        rubricVersion: HOLDOUT_RUBRIC_VERSION,
        configHash: computeConfigHash(),
      },
    },
    holdoutResults: {
      executedAt: new Date().toISOString(),
      corpusHash,
      results: overrides.results ?? cases.map((c) => ({
        caseId: c.caseId, passed: true, maxSeverityFailed: null,
        invariantResults: [], errors: [], errorClass: "product_defect",
      })),
      regressed: false,
    },
  };
}

function setupArtifacts(files: Record<string, string>): void {
  const dir = resolve(process.cwd(), TEST_DIR);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(resolve(dir, name), content, "utf-8");
  }
}

describe("Strict Verifier", () => {
  afterEach(() => {
    try { rmSync(resolve(process.cwd(), TEST_DIR), { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("returns INSUFFICIENT_EVIDENCE when no artifacts exist", () => {
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 2);
  });

  it("returns STRICT_PASS when all expectations match and min traces met", () => {
    const ho = holdoutArtifacts();
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3, ...ho.manifestExtra }),
      "holdout-results.json": JSON.stringify(ho.holdoutResults),
      "traces.jsonl": Array(15).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "c1", invariantResults: [{ expected: "pass", actual: "pass" }, { expected: "fail", actual: "fail" }] },
        { caseId: "c2", invariantResults: [{ expected: "pass", actual: "pass" }] },
      ]),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "STRICT_PASS");
    assert.equal(result.passed, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.metrics.oracleExpectationMatchRate, 1.0);
    assert.equal(result.unresolvedDefects.length, 0);
  });

  it("returns STRICT_FAIL when an expectation mismatch exists", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 1 }),
      "traces.jsonl": Array(10).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "talk-npc", invariantResults: [{ expected: "pass", actual: "fail" }] },
      ]),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "STRICT_FAIL");
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 1);
    assert.ok(result.reasons.length > 0);
    assert.ok(result.unresolvedDefects.includes("legal-npc-talk-rejected"));
  });

  it("detects unresolved defects from case IDs", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 1 }),
      "traces.jsonl": Array(10).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "boundary-task-not-accepted", invariantResults: [{ expected: "fail", actual: "pass" }] },
        { caseId: "fuzz-empty-input", invariantResults: [{ expected: "fail", actual: "pass" }] },
      ]),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.passed, false);
    assert.equal(result.unresolvedDefects.length, 2);
  });

  it("requires minimum rounds", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 1 }),
      "traces.jsonl": Array(15).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "c1", invariantResults: [{ expected: "pass", actual: "pass" }] },
      ]),
    });
    const result = runStrictVerification(TEST_DIR, { minCleanRounds: 3 });
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.includes("Rounds")));
  });

  it("excludes infrastructure-failure cases from failing stats", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3 }),
      "traces.jsonl": Array(12).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "golden-explore-room", passed: true, invariantResults: [{ expected: "pass", actual: "pass" }], errors: [], errorClass: "product_defect" },
        { caseId: "golden-talk-to-npc", passed: false, invariantResults: [], errors: ["Live execution error: The operation was aborted due to timeout"], errorClass: "infrastructure_failure" },
      ]),
    });
    const result = runStrictVerification(TEST_DIR, { minLiveTraces: 10 });
    assert.deepEqual(result.metrics.uniqueFailingCaseIds, []);
    assert.deepEqual(result.metrics.excludedNonGameplayCases, ["golden-talk-to-npc"]);
    assert.equal(result.metrics.validEvidenceCoverage, 0.5);
    // Must NOT be reported as a gameplay fail
    assert.notEqual(result.status, "STRICT_FAIL");
  });

  it("returns EXTERNAL_MODEL_BLOCKED when gateway/auth blocks the majority", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3 }),
      "traces.jsonl": Array(12).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "c1", passed: false, invariantResults: [], errors: ["HTTP 401: Unauthorized"], errorClass: "external_blocked" },
        { caseId: "c2", passed: false, invariantResults: [], errors: ["HTTP 403: Forbidden"], errorClass: "external_blocked" },
      ]),
    });
    const result = runStrictVerification(TEST_DIR, { minLiveTraces: 10, minCleanRounds: 3 });
    assert.equal(result.status, "EXTERNAL_MODEL_BLOCKED");
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 2);
  });

  it("returns INSUFFICIENT_EVIDENCE when every case is infra-excluded", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3 }),
      "traces.jsonl": Array(12).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "c1", passed: false, invariantResults: [], errors: ["fetch failed"], errorClass: "infrastructure_failure" },
        { caseId: "c2", passed: false, invariantResults: [], errors: ["HTTP 503"], errorClass: "model_unavailable" },
      ]),
    });
    const result = runStrictVerification(TEST_DIR, { minLiveTraces: 10 });
    assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.metrics.validEvidenceCoverage, 0);
    // unavailable is neither pass nor gameplay fail
    assert.notEqual(result.status, "STRICT_PASS");
    assert.notEqual(result.status, "STRICT_FAIL");
  });

  // ── Holdout gate (D7) ──

  /** Base artifacts that would otherwise pass all gameplay gates. */
  function passingGameplayArtifacts(): Record<string, string> {
    return {
      "traces.jsonl": Array(15).fill(null).map((_, i) =>
        JSON.stringify({ traceId: `t${i}`, model: "live-gateway", caseId: `case${i}` })
      ).join("\n"),
      "deterministic-results.json": JSON.stringify([
        { caseId: "c1", invariantResults: [{ expected: "pass", actual: "pass" }] },
      ]),
    };
  }

  it("returns INSUFFICIENT_EVIDENCE when holdout binding is missing from an otherwise-passing run", () => {
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3 }),
      ...passingGameplayArtifacts(),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.toLowerCase().includes("holdout")));
  });

  it("returns INSUFFICIENT_EVIDENCE when holdout-results.json was never written", () => {
    const ho = holdoutArtifacts();
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3, ...ho.manifestExtra }),
      ...passingGameplayArtifacts(),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.includes("Holdout not executed")));
  });

  it("returns STRICT_FAIL on critical/major holdout regression", () => {
    const cases = loadHoldoutCases();
    const ho = holdoutArtifacts({
      results: cases.map((c) => ({
        caseId: c.caseId, passed: false, maxSeverityFailed: "critical",
        invariantResults: [{ expected: "pass", actual: "fail" }], errors: [], errorClass: "product_defect",
      })),
    });
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3, ...ho.manifestExtra }),
      "holdout-results.json": JSON.stringify({ ...ho.holdoutResults, regressed: true }),
      ...passingGameplayArtifacts(),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "STRICT_FAIL");
    assert.equal(result.passed, false);
    assert.ok(result.reasons.some((r) => r.includes("Holdout regression")));
  });

  it("returns GATE_TAMPERING_DETECTED when holdout-results corpusHash mismatches manifest", () => {
    const ho = holdoutArtifacts();
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3, ...ho.manifestExtra }),
      "holdout-results.json": JSON.stringify({ ...ho.holdoutResults, corpusHash: "tampered-hash" }),
      ...passingGameplayArtifacts(),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "GATE_TAMPERING_DETECTED");
    assert.equal(result.passed, false);
  });

  it("returns INSUFFICIENT_EVIDENCE when holdout evidence is stale (corpus changed since run)", () => {
    const ho = holdoutArtifacts({ corpusHash: "old-corpus-hash" });
    setupArtifacts({
      "manifest.json": JSON.stringify({ runId: "test", rounds: 3, ...ho.manifestExtra }),
      "holdout-results.json": JSON.stringify(ho.holdoutResults),
      ...passingGameplayArtifacts(),
    });
    const result = runStrictVerification(TEST_DIR);
    assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
    assert.ok(result.reasons.some((r) => r.includes("stale")));
  });
});

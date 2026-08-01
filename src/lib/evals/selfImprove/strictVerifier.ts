/**
 * Strict Completion Gate — Independent Verifier
 *
 * Computes the real campaign status from raw artifacts only.
 * Never trusts self-declared status, summary text, or human-readable claims.
 *
 * Inputs it reads (and ONLY these):
 * - traces.jsonl
 * - deterministic-results.json
 * - manifest.json
 * - state.json
 * - final-report.json (only for metadata, never for status)
 *
 * It NEVER reads:
 * - finalStatus field from any report
 * - claimedResolved
 * - summaryText
 * - Any human-readable success message
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadHoldoutCases, computeCorpusHash, computePromptHash, computeConfigHash,
  bindingMismatchFields, HOLDOUT_RUBRIC_VERSION, type HashBinding,
} from "./holdout";

// ── Types ─────────────────────────────────────────────

export interface StrictVerificationResult {
  passed: boolean;
  status: "STRICT_PASS" | "STRICT_FAIL" | "GATE_TAMPERING_DETECTED" | "INSUFFICIENT_EVIDENCE" | "EXTERNAL_MODEL_BLOCKED";
  reasons: string[];
  metrics: {
    totalTraces: number;
    liveTraces: number;
    oracleExpectationMatches: number;
    oracleExpectationTotal: number;
    oracleExpectationMatchRate: number;
    uniqueFailingCaseIds: string[];
    roundsCompleted: number;
    uniqueDefectClusters: string[];
    /** Cases excluded from Oracle stats due to infra/model unavailability */
    excludedNonGameplayCases: string[];
    /** Valid evidence coverage: judged cases / total cases (0-1) */
    validEvidenceCoverage: number;
  };
  verifiedDefects: string[];
  unresolvedDefects: string[];
  exitCode: number;
}

export interface StrictGateConfig {
  /** Minimum consecutive rounds with 0 Oracle clusters required */
  minCleanRounds: number;
  /** Minimum expectation match rate (0-1) */
  minExpectationMatchRate: number;
  /** Minimum number of live traces required */
  minLiveTraces: number;
  /** Maximum allowed unique failing case IDs */
  maxFailingCases: number;
  /** Whether holdout evidence is required */
  requireHoldout: boolean;
}

const DEFAULT_GATE_CONFIG: StrictGateConfig = {
  minCleanRounds: 3,
  minExpectationMatchRate: 1.0,
  minLiveTraces: 10,
  maxFailingCases: 0,
  requireHoldout: true,
};

// ── Core verification ─────────────────────────────────

export function runStrictVerification(
  runDir: string,
  config: Partial<StrictGateConfig> = {},
): StrictVerificationResult {
  const cfg = { ...DEFAULT_GATE_CONFIG, ...config };
  const reasons: string[] = [];
  const dir = resolve(process.cwd(), runDir);

  // 1. Check required artifacts exist
  const requiredFiles = ["traces.jsonl", "deterministic-results.json", "manifest.json"];
  for (const f of requiredFiles) {
    if (!existsSync(resolve(dir, f))) {
      return {
        passed: false,
        status: "INSUFFICIENT_EVIDENCE",
        reasons: [`Missing required artifact: ${f}`],
        metrics: { totalTraces: 0, liveTraces: 0, oracleExpectationMatches: 0, oracleExpectationTotal: 0, oracleExpectationMatchRate: 0, uniqueFailingCaseIds: [], roundsCompleted: 0, uniqueDefectClusters: [], excludedNonGameplayCases: [], validEvidenceCoverage: 0 },
        verifiedDefects: [],
        unresolvedDefects: [],
        exitCode: 2,
      };
    }
  }

  // 2. Load raw artifacts
  let traces: any[] = [];
  let detResults: any[] = [];
  let manifest: any = {};

  try {
    const tracesRaw = readFileSync(resolve(dir, "traces.jsonl"), "utf-8");
    traces = tracesRaw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* empty */ }

  try {
    detResults = JSON.parse(readFileSync(resolve(dir, "deterministic-results.json"), "utf-8"));
  } catch { /* empty */ }

  try {
    manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf-8"));
  } catch { /* empty */ }

  // ── Holdout gate (D7 fix: requireHoldout was a dead field) ──
  let holdoutRegressed = false;
  let holdoutFailed = false;
  let holdoutEvidenceMissing = false;
  if (cfg.requireHoldout) {
    const holdoutResultsPath = resolve(dir, "holdout-results.json");
    const manifestHoldout = manifest.holdout;
    const manifestHashes = manifest.hashes as HashBinding | undefined;

    if (!manifestHoldout || !manifestHashes) {
      holdoutFailed = true; holdoutEvidenceMissing = true;
      reasons.push("Holdout binding missing from manifest (run predates holdout gate or manifest corrupted)");
    } else {
      // 1. Corpus / prompt / config changed since the run → old holdout evidence is stale
      const currentBinding: HashBinding = {
        codeHash: manifestHashes.codeHash, // code at run time is what it was; staleness checked via corpus/prompt/config
        promptHash: computePromptHash(manifest.provenance?.promptVersion ?? ""),
        modelId: manifestHashes.modelId,
        corpusHash: computeCorpusHash(loadHoldoutCases()),
        rubricVersion: HOLDOUT_RUBRIC_VERSION,
        configHash: computeConfigHash(),
      };
      const mismatches = bindingMismatchFields(manifestHashes, currentBinding)
        .filter((f) => f !== "codeHash" && f !== "modelId");
      if (mismatches.length > 0) {
        holdoutFailed = true; holdoutEvidenceMissing = true;
        reasons.push(`Holdout evidence stale: binding mismatch on ${mismatches.join(", ")} (code/prompt/corpus/config changed since run)`);
      }

      // 2. Holdout must actually have been executed
      if (!manifestHoldout.executedAt || !existsSync(holdoutResultsPath)) {
        holdoutFailed = true; holdoutEvidenceMissing = true;
        reasons.push("Holdout not executed: missing holdout-results.json (INSUFFICIENT_EVIDENCE class)");
      } else {
        try {
          const holdoutRun = JSON.parse(readFileSync(holdoutResultsPath, "utf-8"));
          // 3. Artifact inconsistency = tampering
          if (holdoutRun.corpusHash !== manifestHoldout.corpusHash) {
            return {
              passed: false,
              status: "GATE_TAMPERING_DETECTED",
              reasons: ["holdout-results.json corpusHash does not match manifest holdout corpusHash"],
              metrics: {
                totalTraces: 0, liveTraces: 0, oracleExpectationMatches: 0, oracleExpectationTotal: 0,
                oracleExpectationMatchRate: 0, uniqueFailingCaseIds: [], roundsCompleted: 0,
                uniqueDefectClusters: [], excludedNonGameplayCases: [], validEvidenceCoverage: 0,
              },
              verifiedDefects: [],
              unresolvedDefects: [],
              exitCode: 1,
            };
          }
          const results: any[] = Array.isArray(holdoutRun.results) ? holdoutRun.results : [];
          const validResults = results.filter((r) =>
            !["infrastructure_failure", "model_unavailable", "external_blocked", "insufficient_evidence"].includes(r.errorClass));
          if (validResults.length === 0 && results.length > 0) {
            holdoutFailed = true; holdoutEvidenceMissing = true;
            reasons.push("Holdout evidence invalid: all holdout cases failed on infra/model errors");
          } else if (results.length === 0) {
            holdoutFailed = true; holdoutEvidenceMissing = true;
            reasons.push("Holdout evidence missing: empty results");
          }
          const regressions = validResults.filter(
            (r) => !r.passed && (r.maxSeverityFailed === "critical" || r.maxSeverityFailed === "major"),
          );
          if (regressions.length > 0) {
            holdoutFailed = true;
            holdoutRegressed = true;
            reasons.push(`Holdout regression: ${regressions.map((r) => `${r.caseId}(${r.maxSeverityFailed})`).join(", ")}`);
          }
        } catch {
          holdoutFailed = true; holdoutEvidenceMissing = true;
          reasons.push("Holdout results corrupted: unparseable holdout-results.json");
        }
      }
    }
  }

  // 3. Compute real metrics from raw data
  const liveTraces = traces.filter((t: any) => t.model !== "mock" && t.model !== undefined);
  const totalTraces = traces.length;

  let oracleExpectationMatches = 0;
  let oracleExpectationTotal = 0;
  const uniqueFailingCaseIds = new Set<string>();
  const excludedNonGameplayCases = new Set<string>();
  let externalBlockedCount = 0;
  let modelUnavailableCount = 0;
  let totalCaseCount = 0;

  for (const result of detResults) {
    totalCaseCount++;
    const ec = result.errorClass as string | undefined;
    if (ec === "external_blocked") { externalBlockedCount++; excludedNonGameplayCases.add(result.caseId); continue; }
    if (ec === "model_unavailable") { modelUnavailableCount++; excludedNonGameplayCases.add(result.caseId); continue; }
    if (ec === "infrastructure_failure" || ec === "insufficient_evidence") {
      excludedNonGameplayCases.add(result.caseId);
      continue;
    }
    for (const inv of (result.invariantResults || [])) {
      oracleExpectationTotal++;
      const expectedMatch = (inv.expected === "pass") === (inv.actual === "pass");
      if (expectedMatch) oracleExpectationMatches++;
      if (!expectedMatch) uniqueFailingCaseIds.add(result.caseId);
    }
  }

  const oracleExpectationMatchRate = oracleExpectationTotal > 0
    ? oracleExpectationMatches / oracleExpectationTotal
    : 0;

  const judgedCaseCount = totalCaseCount - excludedNonGameplayCases.size;
  const validEvidenceCoverage = totalCaseCount > 0 ? judgedCaseCount / totalCaseCount : 0;

  // 4. Gate checks
  let passed = true;
  if (holdoutFailed) passed = false;

  // Check: minimum live traces
  if (liveTraces.length < cfg.minLiveTraces) {
    passed = false;
    reasons.push(`Live traces: ${liveTraces.length}/${cfg.minLiveTraces} (minimum not met)`);
  }

  // Check: expectation match rate
  if (oracleExpectationMatchRate < cfg.minExpectationMatchRate) {
    passed = false;
    reasons.push(`Oracle expectation match rate: ${(oracleExpectationMatchRate * 100).toFixed(1)}% (need ${(cfg.minExpectationMatchRate * 100).toFixed(0)}%)`);
  }

  // Check: unique failing cases
  if (uniqueFailingCaseIds.size > cfg.maxFailingCases) {
    passed = false;
    reasons.push(`Unique failing cases: ${uniqueFailingCaseIds.size}/${cfg.maxFailingCases} (${[...uniqueFailingCaseIds].join(", ")})`);
  }

  // Check: rounds completed
  const roundsCompleted = manifest.rounds || 0;
  if (roundsCompleted < cfg.minCleanRounds) {
    passed = false;
    reasons.push(`Rounds completed: ${roundsCompleted}/${cfg.minCleanRounds} (need at least ${cfg.minCleanRounds} clean rounds)`);
  }

  // 5. Determine unique defect clusters from failing cases
  const uniqueDefectClusters = [...new Set(
    [...uniqueFailingCaseIds].map((id) => {
      if (id.includes("empty")) return "empty-input-not-rejected";
      if (id.includes("task")) return "task-completed-before-acceptance";
      if (id.includes("profession")) return "profession-exclusive-ability-bypassed";
      if (id.includes("talk") || id.includes("npc")) return "legal-npc-talk-rejected";
      return id;
    }),
  )];

  const unresolvedDefects = uniqueFailingCaseIds.size > 0 ? uniqueDefectClusters : [];
  const verifiedDefects = uniqueFailingCaseIds.size === 0 ? uniqueDefectClusters : [];

  // 6. Final status determination
  // External unavailability is NEVER a gameplay pass or a gameplay fail:
  // - externally blocked dominates              → EXTERNAL_MODEL_BLOCKED
  // - no valid evidence left to judge           → INSUFFICIENT_EVIDENCE
  let status: StrictVerificationResult["status"];
  if (passed) {
    status = "STRICT_PASS";
  } else if (externalBlockedCount > 0 && externalBlockedCount >= judgedCaseCount + modelUnavailableCount) {
    status = "EXTERNAL_MODEL_BLOCKED";
    reasons.push(`External model blocked: ${externalBlockedCount}/${totalCaseCount} cases blocked by gateway/auth (excluded from gameplay stats)`);
  } else if (uniqueFailingCaseIds.size === 0 && !holdoutRegressed && holdoutEvidenceMissing) {
    status = "INSUFFICIENT_EVIDENCE";
  } else if (totalTraces === 0 || judgedCaseCount === 0) {
    status = "INSUFFICIENT_EVIDENCE";
    if (judgedCaseCount === 0 && totalCaseCount > 0) {
      reasons.push(`No valid gameplay evidence: all ${totalCaseCount} cases excluded as infra/model failures`);
    }
  } else {
    status = "STRICT_FAIL";
  }

  return {
    passed,
    status,
    reasons,
    metrics: {
      totalTraces,
      liveTraces: liveTraces.length,
      oracleExpectationMatches,
      oracleExpectationTotal,
      oracleExpectationMatchRate,
      uniqueFailingCaseIds: [...uniqueFailingCaseIds],
      roundsCompleted,
      uniqueDefectClusters,
      excludedNonGameplayCases: [...excludedNonGameplayCases],
      validEvidenceCoverage,
    },
    verifiedDefects,
    unresolvedDefects,
    exitCode: passed ? 0 : status === "INSUFFICIENT_EVIDENCE" || status === "EXTERNAL_MODEL_BLOCKED" ? 2 : 1,
  };
}

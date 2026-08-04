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
    // ── Holdout-specific metrics ──
    holdoutTotal: number;
    holdoutValid: number;
    holdoutPassed: number;
    holdoutInfraFailures: number;
    holdoutModelUnavailable: number;
    holdoutValidCoverage: number;
    missingRequiredHoldoutCaseIds: string[];
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
  /** Minimum valid evidence coverage for main eval (judged / total, 0-1) */
  minValidEvidenceCoverage: number;
  /** Minimum valid holdout coverage (valid holdout cases / total, 0-1) */
  minHoldoutValidCoverage: number;
  /** Minimum number of valid (non-infra) holdout cases */
  minHoldoutValidCases: number;
  /** Require that all holdout corpus cases produce valid results */
  requireAllRequiredHoldoutCases: boolean;
}

const DEFAULT_GATE_CONFIG: StrictGateConfig = {
  minCleanRounds: 3,
  minExpectationMatchRate: 1.0,
  minLiveTraces: 10,
  maxFailingCases: 0,
  requireHoldout: true,
  minValidEvidenceCoverage: 1.0,
  minHoldoutValidCoverage: 1.0,
  minHoldoutValidCases: 8, // must be kept in sync with holdout corpus
  requireAllRequiredHoldoutCases: true,
};

function emptyMetrics(): StrictVerificationResult["metrics"] {
  return {
    totalTraces: 0, liveTraces: 0,
    oracleExpectationMatches: 0, oracleExpectationTotal: 0, oracleExpectationMatchRate: 0,
    uniqueFailingCaseIds: [], roundsCompleted: 0, uniqueDefectClusters: [],
    excludedNonGameplayCases: [], validEvidenceCoverage: 0,
    holdoutTotal: 0, holdoutValid: 0, holdoutPassed: 0,
    holdoutInfraFailures: 0, holdoutModelUnavailable: 0,
    holdoutValidCoverage: 0, missingRequiredHoldoutCaseIds: [],
  };
}

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
        metrics: emptyMetrics(),
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

  // ── Holdout gate ──
  let holdoutRegressed = false;
  let holdoutFailed = false;
  let holdoutEvidenceMissing = false;
  let holdoutTotal = 0;
  let holdoutValid = 0;
  let holdoutPassed = 0;
  let holdoutInfraFailures = 0;
  let holdoutModelUnavailable = 0;
  let holdoutValidCoverage = 0;
  const missingRequiredHoldoutCaseIds: string[] = [];
  const requiredHoldoutCaseIds: string[] = loadHoldoutCases().map((c) => c.caseId);

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
        codeHash: manifestHashes.codeHash,
        promptHash: computePromptHash(manifest.provenance?.promptVersion ?? ""),
        modelId: manifestHashes.modelId,
        corpusHash: computeCorpusHash(loadHoldoutCases()),
        rubricVersion: HOLDOUT_RUBRIC_VERSION,
        configHash: computeConfigHash(),
      };
      const mismatches = bindingMismatchFields(manifestHashes, currentBinding);
      if (mismatches.length > 0) {
        holdoutFailed = true; holdoutEvidenceMissing = true;
        reasons.push(`Holdout evidence stale: hash mismatch on ${mismatches.join(", ")}`);
      }
      // 2. Holdout must have been executed
      if (!manifestHoldout.executedAt || !existsSync(holdoutResultsPath)) {
        holdoutFailed = true; holdoutEvidenceMissing = true;
        reasons.push("Holdout not executed: missing holdout-results.json (INSUFFICIENT_EVIDENCE class)");
      } else {
        try {
          const holdoutRun = JSON.parse(readFileSync(holdoutResultsPath, "utf-8"));

          // 3. Corpus hash must match manifest
          if (holdoutRun.corpusHash !== manifestHoldout.corpusHash) {
            holdoutFailed = true; holdoutEvidenceMissing = true;
            reasons.push("Holdout corpus hash mismatch — GATE_TAMPERING_DETECTED");
            return {
              passed: false,
              status: "GATE_TAMPERING_DETECTED",
              reasons: ["holdout-results.json corpusHash does not match manifest holdout corpusHash"],
              metrics: emptyMetrics(),
              verifiedDefects: [],
              unresolvedDefects: [],
              exitCode: 3,
            };
          }

          const results: any[] = Array.isArray(holdoutRun.results) ? holdoutRun.results : [];
          holdoutTotal = results.length;

          // Classify each holdout result
          for (const r of results) {
            const ec = r.errorClass as string | undefined;
            if (ec === "infrastructure_failure") { holdoutInfraFailures++; continue; }
            if (ec === "model_unavailable") { holdoutModelUnavailable++; continue; }
            if (ec === "external_blocked") { holdoutModelUnavailable++; continue; }
            // Valid result
            holdoutValid++;
            if (r.passed === true) holdoutPassed++;
            else if (!r.passed && r.maxSeverityFailed && (r.maxSeverityFailed === "critical" || r.maxSeverityFailed === "major")) {
              holdoutRegressed = true;
            }
          }

          holdoutValidCoverage = holdoutTotal > 0 ? holdoutValid / holdoutTotal : 0;

          // Check for missing required cases
          if (cfg.requireAllRequiredHoldoutCases) {
            const resultCaseIds = new Set(results.map((r: any) => r.caseId));
            for (const cid of requiredHoldoutCaseIds) {
              if (!resultCaseIds.has(cid)) {
                missingRequiredHoldoutCaseIds.push(cid);
              }
            }
            if (missingRequiredHoldoutCaseIds.length > 0) {
              holdoutFailed = true; holdoutEvidenceMissing = true;
              reasons.push(`Holdout missing required cases: ${missingRequiredHoldoutCaseIds.join(", ")}`);
            }
          }

          // Coverage gate: valid holdout cases must meet threshold
          if (holdoutValid < cfg.minHoldoutValidCases) {
            holdoutFailed = true; holdoutEvidenceMissing = true;
            reasons.push(`Holdout valid cases: ${holdoutValid}/${cfg.minHoldoutValidCases} (minimum not met; ${holdoutInfraFailures} infra, ${holdoutModelUnavailable} model-unavailable)`);
          }

          if (holdoutValidCoverage < cfg.minHoldoutValidCoverage) {
            holdoutFailed = true; holdoutEvidenceMissing = true;
            reasons.push(`Holdout valid coverage: ${(holdoutValidCoverage * 100).toFixed(0)}% (need ${(cfg.minHoldoutValidCoverage * 100).toFixed(0)}%); ${holdoutInfraFailures} infra-failures, ${holdoutModelUnavailable} model-unavailable`);
          }

          // Regression gate within valid results
          if (holdoutRegressed && !holdoutEvidenceMissing) {
            holdoutFailed = true;
            reasons.push(`Holdout regression detected: ${results.filter((r: any) => !r.passed && r.maxSeverityFailed).length} critical/major failure(s) in valid cases`);
          }

        } catch (e: any) {
          holdoutFailed = true; holdoutEvidenceMissing = true;
          reasons.push(`Holdout evidence unreadable: ${e.message}`);
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

  // Check: valid evidence coverage
  if (totalCaseCount > 0 && validEvidenceCoverage < cfg.minValidEvidenceCoverage) {
    passed = false;
    reasons.push(`Valid evidence coverage: ${(validEvidenceCoverage * 100).toFixed(0)}% (need ${(cfg.minValidEvidenceCoverage * 100).toFixed(0)}%); ${excludedNonGameplayCases.size} cases excluded as infra/model failures`);
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
  let status: StrictVerificationResult["status"];
  if (passed) {
    status = "STRICT_PASS";
  } else if (externalBlockedCount > 0 && externalBlockedCount >= judgedCaseCount + modelUnavailableCount) {
    status = "EXTERNAL_MODEL_BLOCKED";
    reasons.push(`External model blocked: ${externalBlockedCount}/${totalCaseCount} cases blocked by gateway/auth (excluded from gameplay stats)`);
  } else if (uniqueFailingCaseIds.size === 0 && !holdoutRegressed && (holdoutEvidenceMissing || validEvidenceCoverage < cfg.minValidEvidenceCoverage)) {
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
      holdoutTotal,
      holdoutValid,
      holdoutPassed,
      holdoutInfraFailures,
      holdoutModelUnavailable,
      holdoutValidCoverage,
      missingRequiredHoldoutCaseIds,
    },
    verifiedDefects,
    unresolvedDefects,
    exitCode: passed ? 0 : status === "INSUFFICIENT_EVIDENCE" || status === "EXTERNAL_MODEL_BLOCKED" ? 2 : 1,
  };
}

/**
 * Self-Improving Agent System — Defect Triage
 *
 * Processes judge verdicts into triaged defects with stable signatures.
 * Handles deduplication, evidence validation, confidence arbitration,
 * and decides which defects are eligible for automatic repair.
 */

import type {
  SelfImproveJudgeVerdict,
  SelfImproveViolation,
  DefectSignature,
  TriagedDefect,
} from "./types";

// ── Signature generation ──────────────────────────────

export function generateDefectSignature(violation: SelfImproveViolation): DefectSignature {
  const normalizedExpected = violation.expected.toLowerCase().trim();
  const normalizedActual = violation.actual.toLowerCase().trim();

  const fingerprint = `${violation.category}::${violation.ruleId}::${normalizedExpected}::${normalizedActual}`;

  return {
    fingerprint,
    category: violation.category,
    ruleId: violation.ruleId,
    affectedSystem: extractAffectedSystem(violation.category),
    normalizedExpected,
    normalizedActual,
  };
}

function extractAffectedSystem(category: string): string {
  const systemMap: Record<string, string> = {
    action_legality: "action_validation",
    resource_conservation: "inventory",
    npc_epistemic_boundary: "npc_knowledge",
    state_narrative_consistency: "state_commit",
    option_executability: "options_generation",
    player_agency: "turn_resolution",
    task_lifecycle: "task_system",
    forge_transaction: "forge_service",
    profession_boundary: "profession",
    idempotency: "idempotency",
    death_state_gating: "death_state",
    npc_fact_grounding: "npc_knowledge",
    playability_agency: "player_agency",
  };
  return systemMap[category] || category;
}

// ── Deduplication ─────────────────────────────────────

export function deduplicateDefects(defects: TriagedDefect[]): TriagedDefect[] {
  const seen = new Map<string, TriagedDefect>();

  for (const defect of defects) {
    const key = defect.signature.fingerprint;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, defect);
    } else {
      // Merge: keep the highest severity, merge source verdicts
      const severityOrder = { critical: 3, major: 2, minor: 1 };
      if (severityOrder[defect.severity] > severityOrder[existing.severity]) {
        existing.severity = defect.severity;
      }
      existing.sourceVerdicts.push(...defect.sourceVerdicts);
      existing.oracleReproduced = existing.oracleReproduced || defect.oracleReproduced;
      // If any instance is auto-repairable, keep it
      if (defect.autoRepairable && !existing.autoRepairable) {
        existing.autoRepairable = true;
      }
    }
  }

  return Array.from(seen.values());
}

// ── Evidence validation ───────────────────────────────

export function validateViolationEvidence(violation: SelfImproveViolation): boolean {
  // Critical and major violations must have evidence
  if ((violation.severity === "critical" || violation.severity === "major") && !violation.evidence) {
    return false;
  }
  // Evidence must reference player-visible content or structured state
  if (violation.evidence && violation.evidence.length < 3) {
    return false;
  }
  return true;
}

// ── Confidence arbitration ────────────────────────────

export function arbitrateDefects(
  verdicts: SelfImproveJudgeVerdict[],
  minConfidence: number,
  requiredAgreement: number,
): TriagedDefect[] {
  const allViolations: { violation: SelfImproveViolation; judgeModel: string; confidence: number }[] = [];

  for (const verdict of verdicts) {
    if (verdict.inconclusive || verdict.confidence < minConfidence) continue;
    for (const v of verdict.violations) {
      if (validateViolationEvidence(v)) {
        allViolations.push({
          violation: v,
          judgeModel: verdict.judgeModel,
          confidence: verdict.confidence,
        });
      }
    }
  }

  // Group by fingerprint
  const byFingerprint = new Map<string, typeof allViolations>();
  for (const item of allViolations) {
    const sig = generateDefectSignature(item.violation);
    const key = sig.fingerprint;
    if (!byFingerprint.has(key)) byFingerprint.set(key, []);
    byFingerprint.get(key)!.push(item);
  }

  const defects: TriagedDefect[] = [];

  for (const [fingerprint, items] of byFingerprint) {
    const violation = items[0]!.violation;
    const sig = generateDefectSignature(violation);
    const agreeingJudges = new Set(items.map((i) => i.judgeModel)).size;
    const avgConfidence = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;

    // Determine if auto-repairable
    const hasEnoughAgreement = agreeingJudges >= requiredAgreement;
    const hasHighConfidence = avgConfidence >= minConfidence;
    const hasEvidence = items.every((i) => validateViolationEvidence(i.violation));

    let autoRepairable = hasEnoughAgreement && hasHighConfidence && hasEvidence;
    let blockReason: string | undefined;

    if (!hasEnoughAgreement) {
      blockReason = `Only ${agreeingJudges}/${requiredAgreement} judges agree.`;
    } else if (!hasHighConfidence) {
      blockReason = `Average confidence ${avgConfidence.toFixed(2)} < ${minConfidence}.`;
    } else if (!hasEvidence) {
      blockReason = "Insufficient evidence in violation reports.";
    }

    // Critical/major need at least 2 judges
    if ((violation.severity === "critical" || violation.severity === "major") && agreeingJudges < 2) {
      autoRepairable = false;
      blockReason = `Severity ${violation.severity} requires >=2 judges, got ${agreeingJudges}.`;
    }

    defects.push({
      signature: sig,
      severity: violation.severity,
      sourceVerdicts: [], // populated by caller
      oracleReproduced: false,
      autoRepairable,
      blockReason,
      disposition: autoRepairable ? "auto_repair" : "human_review_required",
    });
  }

  // Mark duplicates
  return deduplicateDefects(defects);
}

// ── Oracle reproduction check ─────────────────────────

export function checkOracleReproduction(
  defect: TriagedDefect,
  deterministicResults: { invariantId: string; passed: boolean }[],
): boolean {
  // Check if any deterministic invariant matching this defect's rule failed
  const matching = deterministicResults.filter(
    (r) => r.invariantId === defect.signature.ruleId && !r.passed,
  );
  return matching.length > 0;
}

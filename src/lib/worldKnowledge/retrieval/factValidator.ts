// src/lib/worldKnowledge/retrieval/factValidator.ts
// Post-retrieval fact validation for world knowledge.
//
// Validates retrieved facts for consistency, staleness, and contradictions
// BEFORE they are injected into the LLM prompt. This is a pure-function
// validation layer — no I/O, no LLM calls.
//
// Design principles (from AGENTS.md §4):
// - Pure functions only: no IO, database, file, network, or LLM calls
// - External facts passed in by caller
// - Validators must be covered by tests

import type { RetrievalCandidate } from "../types";

// ── Types ────────────────────────────────────────────────

export type FactValidationSeverity = "error" | "warning" | "info";

export interface FactValidationIssue {
  factKey: string;
  severity: FactValidationSeverity;
  code: string;
  message: string;
  conflictingFactKey?: string;
}

export interface FactValidationResult {
  valid: RetrievalCandidate[];
  filtered: RetrievalCandidate[];
  issues: FactValidationIssue[];
  summary: {
    totalChecked: number;
    passed: number;
    filtered: number;
    errorCount: number;
    warningCount: number;
  };
}

// ── Validators ──────────────────────────────────────────

/**
 * Check for contradictory facts (e.g., same entity described differently).
 */
function detectContradictions(candidates: RetrievalCandidate[]): FactValidationIssue[] {
  const issues: FactValidationIssue[] = [];
  const byEntity = new Map<string, RetrievalCandidate[]>();

  for (const c of candidates) {
    const entityKey = c.fact.identity.factKey.split(":")[0];
    if (!byEntity.has(entityKey)) byEntity.set(entityKey, []);
    byEntity.get(entityKey)!.push(c);
  }

  for (const [, group] of byEntity) {
    if (group.length < 2) continue;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Check for same fact type but very different content
        if (a.fact.factType === b.fact.factType) {
          const aWords = new Set(a.fact.canonicalText.replace(/\s+/g, "").split(""));
          const bWords = new Set(b.fact.canonicalText.replace(/\s+/g, "").split(""));
          const intersection = [...aWords].filter((w) => bWords.has(w)).length;
          const union = new Set([...aWords, ...bWords]).size;
          const similarity = union > 0 ? intersection / union : 0;

          // Very dissimilar facts about the same entity → potential contradiction
          if (similarity < 0.3) {
            issues.push({
              factKey: a.fact.identity.factKey,
              severity: "warning",
              code: "potential_contradiction",
              message: `Facts about same entity have very different content (similarity: ${similarity.toFixed(2)})`,
              conflictingFactKey: b.fact.identity.factKey,
            });
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Check for stale/expired facts.
 * Facts without source or with low importance may be stale.
 */
function detectStaleFacts(candidates: RetrievalCandidate[]): FactValidationIssue[] {
  const issues: FactValidationIssue[] = [];

  for (const c of candidates) {
    // Facts from bootstrap that are very old (no source reference)
    if (c.fact.source.kind === "bootstrap" && !c.fact.source.entityId) {
      issues.push({
        factKey: c.fact.identity.factKey,
        severity: "info",
        code: "bootstrap_no_source",
        message: "Bootstrap fact without entity source reference",
      });
    }

    // Very low importance facts (< 30) may be noise
    if (c.score < 0.2 && c.fact.factType !== "system_hint") {
      issues.push({
        factKey: c.fact.identity.factKey,
        severity: "info",
        code: "low_relevance_noise",
        message: `Low relevance score (${c.score.toFixed(3)}) for non-system fact`,
      });
    }
  }

  return issues;
}

/**
 * Check for duplicate facts with nearly identical content.
 * Uses prefix matching: if one fact's content starts with another's
 * or shares >80% of first 60 chars, they're near-duplicates.
 */
function detectNearDuplicates(candidates: RetrievalCandidate[]): {
  issues: FactValidationIssue[];
  duplicateKeys: Set<string>;
} {
  const issues: FactValidationIssue[] = [];
  const duplicateKeys = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    if (duplicateKeys.has(candidates[i].fact.identity.factKey)) continue;
    const aText = candidates[i].fact.canonicalText.replace(/\s+/g, "");

    for (let j = i + 1; j < candidates.length; j++) {
      if (duplicateKeys.has(candidates[j].fact.identity.factKey)) continue;
      const bText = candidates[j].fact.canonicalText.replace(/\s+/g, "");

      // Check prefix overlap
      const minLen = Math.min(aText.length, bText.length);
      const sliceA = aText.slice(0, Math.min(minLen, 60));
      const sliceB = bText.slice(0, Math.min(minLen, 60));

      // One is a prefix of the other
      const isPrefix = sliceA.startsWith(sliceB) || sliceB.startsWith(sliceA);

      // Or share significant overlap in first 60 chars
      let overlap = 0;
      const maxCheck = Math.min(sliceA.length, sliceB.length);
      for (let k = 0; k < maxCheck; k++) {
        if (sliceA[k] === sliceB[k]) overlap++;
      }
      const overlapRatio = maxCheck > 0 ? overlap / maxCheck : 0;

      if (isPrefix || overlapRatio > 0.85) {
        // Keep the higher-scored one, mark the other as duplicate
        const lower = candidates[i].score >= candidates[j].score ? candidates[j] : candidates[i];
        duplicateKeys.add(lower.fact.identity.factKey);
        issues.push({
          factKey: lower.fact.identity.factKey,
          severity: "warning",
          code: "near_duplicate",
          message: `Near-duplicate fact detected (overlap: ${(overlapRatio * 100).toFixed(0)}%)`,
          conflictingFactKey: (lower === candidates[i] ? candidates[j] : candidates[i]).fact.identity.factKey,
        });
      }
    }
  }

  return { issues, duplicateKeys };
}

/**
 * Check for facts that violate the scope constraints.
 * Session-scoped facts should not appear in global results, etc.
 */
function detectScopeViolations(candidates: RetrievalCandidate[]): FactValidationIssue[] {
  const issues: FactValidationIssue[] = [];

  for (const c of candidates) {
    // Session facts should have a session reference
    if (c.fact.layer === "session_ephemeral_facts" && c.fact.source.kind !== "session") {
      issues.push({
        factKey: c.fact.identity.factKey,
        severity: "warning",
        code: "scope_source_mismatch",
        message: "Session-scoped fact with non-session source",
      });
    }
  }

  return issues;
}

// ── Main validator ──────────────────────────────────────

export interface FactValidatorOptions {
  /** Maximum number of warnings before stopping */
  maxWarnings?: number;
  /** Whether to filter out near-duplicates */
  filterDuplicates?: boolean;
  /** Whether to run contradiction detection (slightly expensive) */
  detectContradictions?: boolean;
}

/**
 * Validate a list of retrieved facts.
 *
 * Returns:
 * - valid: facts that passed all checks
 * - filtered: facts that were removed
 * - issues: detailed validation issues found
 */
export function validateRetrievedFacts(
  candidates: RetrievalCandidate[],
  options: FactValidatorOptions = {},
): FactValidationResult {
  const {
    maxWarnings = 20,
    filterDuplicates = true,
    detectContradictions: checkContradictions = true,
  } = options;

  const allIssues: FactValidationIssue[] = [];

  // 1. Near-duplicate detection (always run — cheap)
  const { issues: dupIssues, duplicateKeys } = detectNearDuplicates(candidates);
  allIssues.push(...dupIssues.slice(0, maxWarnings));

  // 2. Scope violations
  const scopeIssues = detectScopeViolations(candidates);
  allIssues.push(...scopeIssues.slice(0, maxWarnings - allIssues.length));

  // 3. Stale fact detection
  const staleIssues = detectStaleFacts(candidates);
  allIssues.push(...staleIssues.slice(0, maxWarnings - allIssues.length));

  // 4. Contradiction detection (more expensive)
  if (checkContradictions && allIssues.length < maxWarnings) {
    const contraIssues = detectContradictions(candidates);
    allIssues.push(...contraIssues.slice(0, maxWarnings - allIssues.length));
  }

  // Filter invalid facts
  const filteredKeys = new Set<string>();

  // Always filter exact duplicates
  if (filterDuplicates) {
    for (const key of duplicateKeys) {
      filteredKeys.add(key);
    }
  }

  // Filter facts with error-level issues
  for (const issue of allIssues) {
    if (issue.severity === "error") {
      filteredKeys.add(issue.factKey);
    }
  }

  const valid = candidates.filter((c) => !filteredKeys.has(c.fact.identity.factKey));
  const filtered = candidates.filter((c) => filteredKeys.has(c.fact.identity.factKey));

  return {
    valid,
    filtered,
    issues: allIssues,
    summary: {
      totalChecked: candidates.length,
      passed: valid.length,
      filtered: filtered.length,
      errorCount: allIssues.filter((i) => i.severity === "error").length,
      warningCount: allIssues.filter((i) => i.severity === "warning").length,
    },
  };
}

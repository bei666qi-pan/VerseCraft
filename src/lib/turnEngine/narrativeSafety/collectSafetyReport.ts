import type { NarrativeValidationIssue } from "@/lib/turnEngine/validateNarrative";
import type { NpcKnowledgeValidationIssue } from "@/lib/npcKnowledge/npcKnowledgeValidator";
import type { UnsupportedFactCandidate } from "@/lib/worldFacts/unsupportedFactDetector";
import type { PacingIssue } from "@/lib/turnEngine/pacing";
import { auditEntityWhitelist } from "@/lib/turnEngine/narrativeSafety/entityAudit";
import type {
  NarrativeSafetyDecision,
  NarrativeSafetyInput,
  NarrativeSafetyIssue,
  NarrativeSafetyIssueCode,
  NarrativeSafetyIssueSource,
  NarrativeSafetyReport,
  NarrativeSafetySeverity,
  SafetyInvariantCode,
} from "@/lib/turnEngine/narrativeSafety/types";

const SEVERITY_RANK: Record<NarrativeSafetySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const BLOCK_COMMIT_CODES = new Set<NarrativeSafetyIssueCode>([
  "schema_contract_violation",
  "unsupported_root_cause_claim",
  "fact_id_not_allowed",
  "used_fact_id_missing_from_registry",
  "prompt_injection_entity_creation_attempt",
]);

function toInvariant(code: NarrativeSafetyIssueCode): SafetyInvariantCode | undefined {
  switch (code) {
    case "unknown_entity_surface":
    case "unregistered_npc_id":
    case "offscreen_npc_direct_speech":
    case "speaker_not_present":
    case "npc_status_forbidden_direct_speech":
    case "npc_mentions_unknown_npc":
    case "npc_knows_forbidden_fact":
    case "unsupported_new_fact":
    case "unsupported_relationship_claim":
    case "unsupported_location_claim":
    case "unsupported_root_cause_claim":
    case "fact_id_not_allowed":
    case "used_fact_id_missing_from_registry":
    case "narrative_state_delta_conflict":
    case "schema_contract_violation":
    case "pacing_budget_breach":
    case "prompt_injection_entity_creation_attempt":
      return code;
    case "location_conflict_with_delta":
    case "inventory_conflict":
    case "time_feel_drift":
    case "task_mode_mismatch":
      return "narrative_state_delta_conflict";
    case "root_cause_leak":
      return "unsupported_root_cause_claim";
    case "consecutive_peak":
    case "peak_not_resolved":
    case "cooldown_major_fact_forbidden":
    case "strong_fact_budget_exceeded":
    case "major_reveal_requires_reveal_lane":
    case "major_reveal_fact_not_allowed":
    case "major_reveal_missing_fact_id":
    case "major_reveal_prerequisite_missing":
    case "major_reveal_cooldown_active":
    case "reveal_without_evidence_fact_id":
    case "crisis_chain_overflow":
    case "choice_without_consequence_delta":
    case "model_pacing_state_candidate":
      return "pacing_budget_breach";
    default:
      return undefined;
  }
}

function normalizeIssue(args: {
  code: NarrativeSafetyIssueCode;
  severity: NarrativeSafetySeverity;
  source: NarrativeSafetyIssueSource;
  detail?: string;
  anchor?: string;
  originalCode?: string;
}): NarrativeSafetyIssue {
  const invariant = toInvariant(args.code);
  return {
    code: args.code,
    severity: args.severity,
    source: args.source,
    ...(args.detail ? { detail: args.detail } : {}),
    ...(args.anchor ? { anchor: args.anchor } : {}),
    ...(invariant ? { invariant } : {}),
    ...(args.originalCode ? { originalCode: args.originalCode } : {}),
  };
}

function fromValidateNarrativeIssue(issue: NarrativeValidationIssue): NarrativeSafetyIssue {
  return normalizeIssue({
    code: issue.code,
    severity: issue.severity,
    source: "validateNarrative",
    detail: issue.detail,
    anchor: issue.anchor,
    originalCode: issue.code,
  });
}

function fromNpcKnowledgeIssue(issue: NpcKnowledgeValidationIssue): NarrativeSafetyIssue {
  return normalizeIssue({
    code: issue.code,
    severity: issue.severity,
    source: "npcKnowledgeValidator",
    detail: issue.detail,
    anchor: issue.anchor,
    originalCode: issue.code,
  });
}

function fromUnsupportedCandidate(candidate: UnsupportedFactCandidate): NarrativeSafetyIssue {
  return normalizeIssue({
    code: candidate.code,
    severity: candidate.severity,
    source: "unsupportedFactDetector",
    detail: candidate.text,
    anchor: candidate.factId,
    originalCode: candidate.code,
  });
}

function fromPacingIssue(issue: PacingIssue): NarrativeSafetyIssue {
  return normalizeIssue({
    code: issue.code,
    severity: issue.severity,
    source: "pacing",
    detail: issue.detail,
    anchor: issue.anchor,
    originalCode: issue.code,
  });
}

function collectWorldFactIssues(input: NarrativeSafetyInput): NarrativeSafetyIssue[] {
  const facts = new Map((input.worldFacts ?? []).map((fact) => [fact.factId, fact]));
  if (facts.size === 0 && !input.usedFactIds?.length) return [];

  const allowed = new Set(input.allowedFactIds ?? []);
  const maxRevealRank = input.maxRevealRank ?? Number.POSITIVE_INFINITY;
  const issues: NarrativeSafetyIssue[] = [];

  for (const factId of input.usedFactIds ?? []) {
    const fact = facts.get(factId);
    if (!fact) {
      issues.push(
        normalizeIssue({
          code: "used_fact_id_missing_from_registry",
          severity: "high",
          source: "worldFactRegistry",
          detail: `fact=${factId}`,
          anchor: factId,
        })
      );
      continue;
    }
    if ((allowed.size > 0 && !allowed.has(factId)) || fact.revealTier > maxRevealRank) {
      issues.push(
        normalizeIssue({
          code: "fact_id_not_allowed",
          severity: fact.revealTier > maxRevealRank ? "high" : "medium",
          source: "worldFactRegistry",
          detail: `fact=${factId}|revealTier=${fact.revealTier}|maxRevealRank=${maxRevealRank}`,
          anchor: factId,
        })
      );
    }
  }

  return issues;
}

function dedupeIssues(issues: readonly NarrativeSafetyIssue[]): NarrativeSafetyIssue[] {
  const out: NarrativeSafetyIssue[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    const key = [
      issue.source,
      issue.code,
      issue.severity,
      issue.detail ?? "",
      issue.anchor ?? "",
      issue.invariant ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

function maxSeverityOf(issues: readonly NarrativeSafetyIssue[]): NarrativeSafetySeverity | null {
  let max: NarrativeSafetySeverity | null = null;
  for (const issue of issues) {
    if (!max || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[max]) {
      max = issue.severity;
    }
  }
  return max;
}

function decide(issues: readonly NarrativeSafetyIssue[]): NarrativeSafetyDecision {
  if (issues.some((issue) => issue.severity === "high" && BLOCK_COMMIT_CODES.has(issue.code))) {
    return "block_commit";
  }
  if (issues.some((issue) => issue.severity === "high" || issue.severity === "medium")) {
    return "repair";
  }
  return "pass";
}

function buildTelemetry(
  input: NarrativeSafetyInput,
  issues: readonly NarrativeSafetyIssue[]
): NarrativeSafetyReport["telemetry"] {
  const byCode: Partial<Record<NarrativeSafetyIssueCode, number>> = {};
  const bySeverity: Record<NarrativeSafetySeverity, number> = { low: 0, medium: 0, high: 0 };
  const bySource: Partial<Record<NarrativeSafetyIssueSource, number>> = {};

  for (const issue of issues) {
    byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
    bySeverity[issue.severity] += 1;
    bySource[issue.source] = (bySource[issue.source] ?? 0) + 1;
  }

  return {
    totalIssues: issues.length,
    byCode,
    bySeverity,
    bySource,
    ...(input.validateNarrativeReport?.telemetry || input.validateNarrativeTelemetry
      ? { validateNarrative: input.validateNarrativeReport?.telemetry ?? input.validateNarrativeTelemetry ?? undefined }
      : {}),
    ...(input.npcKnowledgeReport?.telemetry ? { npcKnowledge: input.npcKnowledgeReport.telemetry } : {}),
    ...(input.unsupportedFactReport?.telemetry ? { unsupportedFacts: input.unsupportedFactReport.telemetry } : {}),
    ...(input.pacingReport?.telemetry ? { pacing: input.pacingReport.telemetry } : {}),
  };
}

export function collectSafetyReport(input: NarrativeSafetyInput = {}): NarrativeSafetyReport {
  const issues: NarrativeSafetyIssue[] = [];

  for (const issue of input.validateNarrativeReport?.issues ?? input.validateNarrativeIssues ?? []) {
    issues.push(fromValidateNarrativeIssue(issue));
  }

  for (const issue of input.npcKnowledgeReport?.issues ?? input.npcKnowledgeIssues ?? []) {
    issues.push(fromNpcKnowledgeIssue(issue));
  }

  for (const candidate of input.unsupportedFactReport?.unsupportedCandidates ?? input.unsupportedFactIssues ?? []) {
    issues.push(fromUnsupportedCandidate(candidate));
  }

  for (const issue of input.pacingReport?.issues ?? input.pacingIssues ?? []) {
    issues.push(fromPacingIssue(issue));
  }

  issues.push(...auditEntityWhitelist(input));
  issues.push(...collectWorldFactIssues(input));

  const deduped = dedupeIssues(issues);
  const decision = decide(deduped);
  const invariantsViolated = [
    ...new Set(deduped.map((issue) => issue.invariant).filter((value): value is SafetyInvariantCode => Boolean(value))),
  ];

  return {
    ok: decision === "pass",
    decision,
    issues: deduped,
    invariantsViolated,
    maxSeverity: maxSeverityOf(deduped),
    telemetry: buildTelemetry(input, deduped),
  };
}

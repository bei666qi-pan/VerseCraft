import type { NarrativeValidationIssue } from "@/lib/turnEngine/validateNarrative";
import {
  getWorldFactById,
  type WorldFact,
  type WorldFactCategory,
  type WorldFactSource,
  type WorldFactTruthLevel,
} from "@/lib/worldFacts/worldFactRegistry";

export type WorldFactCommitCandidate = Partial<WorldFact> & {
  factId?: string;
  content?: string;
  category?: WorldFactCategory;
  truthLevel?: WorldFactTruthLevel;
  source?: WorldFactSource;
  /** Optional verifier signal for future world-engine outputs. */
  preconditionPassed?: boolean;
};

export type RejectedWorldFact = {
  candidate: WorldFactCommitCandidate;
  reason:
    | "missing_fact_id"
    | "missing_required_metadata"
    | "registry_fact_missing"
    | "candidate_truth_level"
    | "uncertain_fact_stated_as_truth"
    | "unsupported_root_cause"
    | "unsupported_relationship"
    | "world_engine_candidate_requires_precondition";
};

export type FactCommitGateResult = {
  allowedFacts: WorldFact[];
  rejectedFacts: RejectedWorldFact[];
  rewriteHints: string[];
  shouldBlockCommit: boolean;
};

export type GateFactCommitArgs = {
  resolvedDmTurn: Record<string, unknown>;
  candidateFacts: readonly WorldFactCommitCandidate[];
  validatorIssues: readonly NarrativeValidationIssue[];
  maxRevealRank: number;
};

const UNCERTAIN_RE = /(听说|据说|传闻|有人说|像是|好像|也许|可能|不确定|我猜|他们说|别当真)/;

function hasRequiredMetadata(candidate: WorldFactCommitCandidate): boolean {
  return Boolean(
    candidate.factId &&
      candidate.content &&
      candidate.category &&
      candidate.truthLevel &&
      candidate.source &&
      Array.isArray(candidate.ownerNpcIds) &&
      Array.isArray(candidate.floorIds) &&
      Array.isArray(candidate.relatedNpcIds) &&
      typeof candidate.revealTier === "number"
  );
}

function reject(
  rejectedFacts: RejectedWorldFact[],
  candidate: WorldFactCommitCandidate,
  reason: RejectedWorldFact["reason"]
): void {
  rejectedFacts.push({ candidate: { ...candidate }, reason });
}

function materialize(candidate: WorldFactCommitCandidate): WorldFact | null {
  if (!hasRequiredMetadata(candidate)) return null;
  return {
    factId: String(candidate.factId),
    content: String(candidate.content),
    category: candidate.category as WorldFactCategory,
    truthLevel: candidate.truthLevel as WorldFactTruthLevel,
    source: candidate.source as WorldFactSource,
    ownerNpcIds: [...(candidate.ownerNpcIds ?? [])],
    floorIds: [...(candidate.floorIds ?? [])],
    relatedNpcIds: [...(candidate.relatedNpcIds ?? [])],
    revealTier: Number(candidate.revealTier),
    ...(candidate.createdTurnId ? { createdTurnId: candidate.createdTurnId } : {}),
    ...(typeof candidate.expiresAtTurn === "number" ? { expiresAtTurn: candidate.expiresAtTurn } : {}),
  };
}

export function gateFactCommit(args: GateFactCommitArgs): FactCommitGateResult {
  const narrative = String(args.resolvedDmTurn.narrative ?? "");
  const allowedFacts: WorldFact[] = [];
  const rejectedFacts: RejectedWorldFact[] = [];
  const rewriteHints: string[] = [];
  const issueCodes = new Set(args.validatorIssues.map((issue) => issue.code));
  let shouldBlockCommit = false;

  if (issueCodes.has("unsupported_root_cause_claim") || issueCodes.has("root_cause_leak")) {
    shouldBlockCommit = true;
    rewriteHints.push("rewrite_root_cause_as_unavailable_or_hint");
  }
  if (issueCodes.has("unsupported_relationship_claim")) {
    rewriteHints.push("drop_or_hedge_unsupported_relationship_claim");
  }

  for (const candidate of args.candidateFacts) {
    const factId = String(candidate.factId ?? "").trim();
    if (!factId) {
      reject(rejectedFacts, candidate, "missing_fact_id");
      continue;
    }

    const registryFact = getWorldFactById(factId);
    const materialized = materialize(candidate) ?? registryFact;
    if (!materialized) {
      reject(rejectedFacts, candidate, "missing_required_metadata");
      continue;
    }
    if (!registryFact && candidate.truthLevel !== "session_committed") {
      reject(rejectedFacts, candidate, "registry_fact_missing");
      continue;
    }
    if (materialized.revealTier > args.maxRevealRank) {
      reject(rejectedFacts, candidate, "registry_fact_missing");
      continue;
    }
    if (materialized.truthLevel === "candidate") {
      reject(rejectedFacts, candidate, "candidate_truth_level");
      rewriteHints.push(`candidate_fact_not_committed:${factId}`);
      continue;
    }
    if (
      (materialized.truthLevel === "rumor" || materialized.truthLevel === "hypothesis") &&
      narrative &&
      !UNCERTAIN_RE.test(narrative)
    ) {
      reject(rejectedFacts, candidate, "uncertain_fact_stated_as_truth");
      rewriteHints.push(`mark_uncertain:${factId}`);
      continue;
    }
    if (materialized.category === "apartment_root" && issueCodes.has("unsupported_root_cause_claim")) {
      reject(rejectedFacts, candidate, "unsupported_root_cause");
      shouldBlockCommit = true;
      continue;
    }
    if (materialized.category === "relationship" && issueCodes.has("unsupported_relationship_claim")) {
      reject(rejectedFacts, candidate, "unsupported_relationship");
      continue;
    }
    if (
      materialized.source === "world_engine" &&
      candidate.preconditionPassed !== true &&
      materialized.truthLevel !== "canon" &&
      materialized.truthLevel !== "session_committed"
    ) {
      reject(rejectedFacts, candidate, "world_engine_candidate_requires_precondition");
      rewriteHints.push(`world_engine_candidate_pending:${factId}`);
      continue;
    }

    allowedFacts.push(materialized);
  }

  return {
    allowedFacts,
    rejectedFacts,
    rewriteHints: [...new Set(rewriteHints)],
    shouldBlockCommit,
  };
}

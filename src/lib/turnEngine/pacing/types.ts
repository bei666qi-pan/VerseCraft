import type { StateDelta, TurnLane } from "@/lib/turnEngine/types";
import type { NarrativeAuditCandidateNewFact } from "@/lib/worldFacts/narrativeAudit";
import type { WorldFact, WorldFactCategory, WorldFactTruthLevel } from "@/lib/worldFacts/worldFactRegistry";

export type BeatState = "setup" | "rising" | "choice" | "peak" | "aftermath" | "cooldown";

export type PacingSeverity = "low" | "medium" | "high";

export type PacingIssueCode =
  | "consecutive_peak"
  | "peak_not_resolved"
  | "cooldown_major_fact_forbidden"
  | "strong_fact_budget_exceeded"
  | "major_reveal_requires_reveal_lane"
  | "major_reveal_fact_not_allowed"
  | "major_reveal_missing_fact_id"
  | "major_reveal_prerequisite_missing"
  | "major_reveal_cooldown_active"
  | "reveal_without_evidence_fact_id"
  | "crisis_chain_overflow"
  | "choice_without_consequence_delta"
  | "model_pacing_state_candidate";

export type RevealBudget = {
  maxStrongFactsByLane?: Partial<Record<TurnLane, number>>;
  requiredPrerequisiteClues?: number;
  prerequisiteTaskIds?: readonly string[];
  majorRevealCooldown?: number;
  maxConsecutiveCrisisTurns?: number;
};

export type PacingStateSnapshot = {
  beatState?: BeatState | null;
  consecutivePeakTurns?: number;
  consecutiveCrisisTurns?: number;
  majorRevealCooldown?: number;
  prerequisiteClueCount?: number;
  completedTaskIds?: readonly string[];
  pendingChoiceConsequence?: boolean;
  tension?: number;
};

export type PacingWorldFact = Pick<
  WorldFact,
  "factId" | "category" | "truthLevel" | "revealTier"
>;

export type PacingCandidateFact = Pick<
  NarrativeAuditCandidateNewFact,
  "text" | "category" | "confidence" | "proposed_source" | "factId" | "truthLevel" | "revealTier"
>;

export type PacingCandidate = {
  beatState?: BeatState | null;
  usedFactIds?: readonly string[];
  candidateNewFacts?: readonly PacingCandidateFact[];
  majorRevealFactIds?: readonly string[];
  isMajorReveal?: boolean;
  crisis?: boolean;
  tensionDelta?: number | null;
  isKeyChoiceResolution?: boolean;
  modelProposedBeatState?: string | null;
  dmChangeSet?: Record<string, unknown> | null;
};

export type PacingInput = {
  lane: TurnLane;
  candidate: PacingCandidate;
  stateDelta?: StateDelta | null;
  previousSnapshot?: PacingStateSnapshot | null;
  revealBudget?: RevealBudget | null;
  allowedFactIds?: readonly string[] | null;
  worldFacts?: readonly PacingWorldFact[] | null;
  directorDueAgendaHint?: string | null;
};

export type PacingFactEvidence = {
  factId?: string;
  category?: WorldFactCategory;
  truthLevel?: WorldFactTruthLevel;
  revealTier?: number;
  source: "used_fact_id" | "candidate_new_fact" | "major_reveal_fact_id";
  text?: string;
  hasEvidenceFactId: boolean;
  allowed: boolean;
};

export type PacingIssue = {
  code: PacingIssueCode;
  severity: PacingSeverity;
  detail?: string;
  anchor?: string;
};

export type PacingValidationTelemetry = {
  totalIssues: number;
  byCode: Partial<Record<PacingIssueCode, number>>;
  bySeverity: Record<PacingSeverity, number>;
  lane: TurnLane;
  previousBeatState: BeatState | null;
  candidateBeatState: BeatState | null;
  strongFactCount: number;
  majorRevealCount: number;
  allowedMajorRevealCount: number;
};

export type PacingValidationReport = {
  ok: boolean;
  issues: PacingIssue[];
  maxSeverity: PacingSeverity | null;
  telemetry: PacingValidationTelemetry;
};

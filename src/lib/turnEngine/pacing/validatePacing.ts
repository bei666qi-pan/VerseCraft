import type { StateDelta, TurnLane } from "@/lib/turnEngine/types";
import {
  normalizeNarrativeAuditPayload,
  type NarrativeAuditCandidateNewFact,
} from "@/lib/worldFacts/narrativeAudit";
import type { WorldFactCategory } from "@/lib/worldFacts/worldFactRegistry";
import type {
  BeatState,
  PacingCandidate,
  PacingFactEvidence,
  PacingInput,
  PacingIssue,
  PacingIssueCode,
  PacingSeverity,
  PacingValidationReport,
  RevealBudget,
} from "@/lib/turnEngine/pacing/types";

const SEVERITY_RANK: Record<PacingSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const STRONG_FACT_CATEGORIES = new Set<WorldFactCategory>([
  "apartment_root",
  "relationship",
  "location",
  "event",
  "item",
  "npc",
  "task",
]);

const MAJOR_TEXT_RE =
  /(root|cause|truth|final|endgame|abyss|faction|root_cause|major_reveal|apartment_root|终局|真相|根因|阵营)/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (out.length >= max) break;
    const text = asString(item).slice(0, 160);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const n = asNumber(value);
  const safe = n === null ? fallback : Math.trunc(n);
  return Math.max(min, Math.min(max, safe));
}

export function normalizeBeatState(value: unknown): BeatState | null {
  const raw = asString(value).toLowerCase();
  switch (raw) {
    case "setup":
    case "opening":
    case "quiet":
      return "setup";
    case "rising":
    case "pressure":
    case "reveal":
      return "rising";
    case "choice":
    case "collision":
      return "choice";
    case "peak":
    case "climax":
    case "countdown":
      return "peak";
    case "aftermath":
    case "aftershock":
    case "echo":
      return "aftermath";
    case "cooldown":
    case "closing":
      return "cooldown";
    default:
      return null;
  }
}

function readNarrativeAudit(dmRecord: Record<string, unknown>): {
  usedFactIds: string[];
  candidateNewFacts: NarrativeAuditCandidateNewFact[];
  speakerNpcId?: string;
} {
  const rawAudit = asRecord(dmRecord._narrative_audit);
  const audit = normalizeNarrativeAuditPayload(
    {
      used_fact_ids: rawAudit?.used_fact_ids ?? dmRecord.used_fact_ids,
      candidate_new_facts: rawAudit?.candidate_new_facts ?? dmRecord.candidate_new_facts,
      mentioned_entity_ids: rawAudit?.mentioned_entity_ids ?? dmRecord.mentioned_entity_ids,
      speaker_npc_id: rawAudit?.speaker_npc_id ?? dmRecord.speaker_npc_id,
    },
    { preserveEmptyArrays: true }
  );
  return {
    usedFactIds: audit?.used_fact_ids ?? [],
    candidateNewFacts: audit?.candidate_new_facts ?? [],
    ...(audit?.speaker_npc_id ? { speakerNpcId: audit.speaker_npc_id } : {}),
  };
}

export function buildPacingCandidateFromDmRecord(
  dmRecord: Record<string, unknown>,
  overrides: Partial<PacingCandidate> = {}
): PacingCandidate {
  const audit = readNarrativeAudit(dmRecord);
  const dmChangeSet = asRecord(dmRecord.dm_change_set);
  const nestedPacing = asRecord(dmRecord.pacing);
  const proposedBeatState =
    asString(dmChangeSet?.beat_state ?? dmChangeSet?.beatState ?? nestedPacing?.beat_state ?? dmRecord.beat_state) ||
    null;
  const majorRevealFactIds = [
    ...asStringArray(dmChangeSet?.major_reveal_fact_ids ?? dmChangeSet?.majorRevealFactIds),
    ...asStringArray(nestedPacing?.major_reveal_fact_ids ?? dmRecord.major_reveal_fact_ids),
  ];
  const tensionDelta = asNumber(dmChangeSet?.tension_delta ?? dmChangeSet?.tensionDelta ?? nestedPacing?.tension_delta);

  return {
    usedFactIds: audit.usedFactIds,
    candidateNewFacts: audit.candidateNewFacts,
    ...(majorRevealFactIds.length ? { majorRevealFactIds } : {}),
    isMajorReveal:
      asBoolean(dmChangeSet?.major_reveal ?? dmChangeSet?.majorReveal ?? nestedPacing?.major_reveal ?? dmRecord.major_reveal),
    isKeyChoiceResolution: asBoolean(
      dmChangeSet?.key_choice_resolved ??
        dmChangeSet?.choice_resolved ??
        dmChangeSet?.keyChoiceResolved ??
        nestedPacing?.key_choice_resolved
    ),
    crisis: asBoolean(dmChangeSet?.crisis ?? nestedPacing?.crisis ?? dmRecord.crisis),
    ...(tensionDelta !== null ? { tensionDelta } : {}),
    ...(proposedBeatState ? { modelProposedBeatState: proposedBeatState } : {}),
    ...(dmChangeSet ? { dmChangeSet } : {}),
    ...overrides,
  };
}

function defaultStrongFactBudget(lane: TurnLane): number {
  if (lane === "FAST") return 0;
  if (lane === "REVEAL") return 2;
  return 1;
}

function strongFactBudgetForLane(lane: TurnLane, budget: RevealBudget | null | undefined): number {
  const configured = budget?.maxStrongFactsByLane?.[lane];
  return typeof configured === "number" && Number.isFinite(configured)
    ? Math.max(0, Math.trunc(configured))
    : defaultStrongFactBudget(lane);
}

function isStrongCategory(category: WorldFactCategory | undefined): boolean {
  return Boolean(category && STRONG_FACT_CATEGORIES.has(category));
}

function isMajorEvidence(fact: Pick<PacingFactEvidence, "category" | "revealTier" | "text">): boolean {
  return fact.category === "apartment_root" || (typeof fact.revealTier === "number" && fact.revealTier >= 2) || MAJOR_TEXT_RE.test(fact.text ?? "");
}

function collectFactEvidence(input: PacingInput): PacingFactEvidence[] {
  const facts = new Map((input.worldFacts ?? []).map((fact) => [fact.factId, fact]));
  const allowed = new Set(input.allowedFactIds ?? []);
  const out: PacingFactEvidence[] = [];

  for (const factId of input.candidate.usedFactIds ?? []) {
    const fact = facts.get(factId);
    out.push({
      factId,
      ...(fact?.category ? { category: fact.category } : {}),
      ...(fact?.truthLevel ? { truthLevel: fact.truthLevel } : {}),
      ...(typeof fact?.revealTier === "number" ? { revealTier: fact.revealTier } : {}),
      source: "used_fact_id",
      hasEvidenceFactId: true,
      allowed: allowed.size === 0 ? true : allowed.has(factId),
    });
  }

  for (const candidate of input.candidate.candidateNewFacts ?? []) {
    out.push({
      ...(candidate.factId ? { factId: candidate.factId } : {}),
      ...(candidate.category ? { category: candidate.category } : {}),
      ...(candidate.truthLevel ? { truthLevel: candidate.truthLevel } : {}),
      ...(typeof candidate.revealTier === "number" ? { revealTier: candidate.revealTier } : {}),
      source: "candidate_new_fact",
      text: candidate.text,
      hasEvidenceFactId: Boolean(candidate.factId),
      allowed: Boolean(candidate.factId) && (allowed.size === 0 || allowed.has(candidate.factId)),
    });
  }

  for (const factId of input.candidate.majorRevealFactIds ?? []) {
    const fact = facts.get(factId);
    out.push({
      factId,
      ...(fact?.category ? { category: fact.category } : {}),
      ...(fact?.truthLevel ? { truthLevel: fact.truthLevel } : {}),
      ...(typeof fact?.revealTier === "number" ? { revealTier: fact.revealTier } : {}),
      source: "major_reveal_fact_id",
      hasEvidenceFactId: true,
      allowed: allowed.size === 0 ? true : allowed.has(factId),
    });
  }

  return out;
}

function hasMeaningfulDelta(delta: StateDelta | null | undefined, dmRecord: Record<string, unknown> | null | undefined): boolean {
  if (!delta && !dmRecord) return false;
  if (delta) {
    if (delta.isActionLegal === false || delta.mustDegrade) return true;
    if (delta.isDeath || delta.sanityDamage !== 0) return true;
    if (typeof delta.hpDelta === "number" && delta.hpDelta !== 0) return true;
    if (typeof delta.originiumDelta === "number" && delta.originiumDelta !== 0) return true;
    if (delta.playerLocation) return true;
    if (delta.npcLocationUpdates.length || delta.npcAttitudeUpdates.length) return true;
    if (delta.taskUpdates.length || delta.newTasks.length) return true;
    if (delta.consumesTime && delta.timeCost && delta.timeCost !== "free") return true;
  }
  if (!dmRecord) return false;
  const arrayFields = [
    "codex_updates",
    "relationship_updates",
    "awarded_items",
    "awarded_warehouse_items",
    "new_tasks",
    "task_updates",
    "npc_location_updates",
  ];
  return arrayFields.some((field) => Array.isArray(dmRecord[field]) && (dmRecord[field] as unknown[]).length > 0);
}

function issue(code: PacingIssueCode, severity: PacingSeverity, detail?: string, anchor?: string): PacingIssue {
  return {
    code,
    severity,
    ...(detail ? { detail } : {}),
    ...(anchor ? { anchor } : {}),
  };
}

function maxSeverityOf(issues: readonly PacingIssue[]): PacingSeverity | null {
  let max: PacingSeverity | null = null;
  for (const item of issues) {
    if (!max || SEVERITY_RANK[item.severity] > SEVERITY_RANK[max]) {
      max = item.severity;
    }
  }
  return max;
}

function buildTelemetry(args: {
  input: PacingInput;
  issues: readonly PacingIssue[];
  previousBeatState: BeatState | null;
  candidateBeatState: BeatState | null;
  strongFactCount: number;
  majorRevealCount: number;
  allowedMajorRevealCount: number;
}): PacingValidationReport["telemetry"] {
  const byCode: Partial<Record<PacingIssueCode, number>> = {};
  const bySeverity: Record<PacingSeverity, number> = { low: 0, medium: 0, high: 0 };
  for (const item of args.issues) {
    byCode[item.code] = (byCode[item.code] ?? 0) + 1;
    bySeverity[item.severity] += 1;
  }
  return {
    totalIssues: args.issues.length,
    byCode,
    bySeverity,
    lane: args.input.lane,
    previousBeatState: args.previousBeatState,
    candidateBeatState: args.candidateBeatState,
    strongFactCount: args.strongFactCount,
    majorRevealCount: args.majorRevealCount,
    allowedMajorRevealCount: args.allowedMajorRevealCount,
  };
}

function dedupeIssues(issues: readonly PacingIssue[]): PacingIssue[] {
  const out: PacingIssue[] = [];
  const seen = new Set<string>();
  for (const item of issues) {
    const key = [item.code, item.severity, item.detail ?? "", item.anchor ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function validatePacing(input: PacingInput): PacingValidationReport {
  const issues: PacingIssue[] = [];
  const previousBeatState = input.previousSnapshot?.beatState ?? null;
  const candidateBeatState =
    input.candidate.beatState ?? normalizeBeatState(input.directorDueAgendaHint) ?? null;
  const evidence = collectFactEvidence(input);
  const strongFacts = evidence.filter((fact) => isStrongCategory(fact.category) || MAJOR_TEXT_RE.test(fact.text ?? ""));
  const majorFacts = evidence.filter((fact) => isMajorEvidence(fact));
  const explicitMajorReveal = Boolean(input.candidate.isMajorReveal);
  const hasMajorReveal = explicitMajorReveal || majorFacts.length > 0;
  const allowedMajorRevealCount = majorFacts.filter((fact) => fact.allowed).length;

  if (previousBeatState === "peak" && candidateBeatState === "peak") {
    issues.push(issue("consecutive_peak", "high", "previous_peak_to_candidate_peak"));
  } else if (previousBeatState === "peak" && candidateBeatState && candidateBeatState !== "aftermath" && candidateBeatState !== "cooldown") {
    issues.push(issue("peak_not_resolved", "high", `next=${candidateBeatState}`));
  }
  if ((input.previousSnapshot?.consecutivePeakTurns ?? 0) > 0 && candidateBeatState === "peak") {
    issues.push(issue("consecutive_peak", "high", `count=${input.previousSnapshot?.consecutivePeakTurns}`));
  }

  const inCooldown = previousBeatState === "cooldown" || candidateBeatState === "cooldown";
  if (inCooldown && (hasMajorReveal || strongFacts.some((fact) => fact.category === "npc" || fact.category === "relationship"))) {
    issues.push(issue("cooldown_major_fact_forbidden", "high", `strongFacts=${strongFacts.length}`));
  }

  const strongBudget = strongFactBudgetForLane(input.lane, input.revealBudget);
  if (strongFacts.length > strongBudget) {
    issues.push(
      issue(
        "strong_fact_budget_exceeded",
        input.lane === "FAST" || strongFacts.length - strongBudget >= 2 ? "high" : "medium",
        `lane=${input.lane}|count=${strongFacts.length}|budget=${strongBudget}`
      )
    );
  }

  if (input.lane === "REVEAL") {
    const unsupportedRevealFacts = strongFacts.filter((fact) => !fact.hasEvidenceFactId || !fact.allowed);
    for (const fact of unsupportedRevealFacts) {
      issues.push(
        issue(
          "reveal_without_evidence_fact_id",
          "high",
          `source=${fact.source}|allowed=${fact.allowed}`,
          fact.factId
        )
      );
    }
  }

  if (hasMajorReveal) {
    if (input.lane !== "REVEAL") {
      issues.push(issue("major_reveal_requires_reveal_lane", "high", `lane=${input.lane}`));
    }
    if (majorFacts.length === 0) {
      issues.push(issue("major_reveal_missing_fact_id", "high", "major reveal without fact id"));
    }
    for (const fact of majorFacts) {
      if (!fact.allowed) {
        issues.push(issue("major_reveal_fact_not_allowed", "high", `source=${fact.source}`, fact.factId));
      }
    }

    const cooldown = clampInt(
      input.revealBudget?.majorRevealCooldown ?? input.previousSnapshot?.majorRevealCooldown,
      0,
      999,
      0
    );
    if (cooldown > 0) {
      issues.push(issue("major_reveal_cooldown_active", "high", `cooldown=${cooldown}`));
    }

    const requiredClues = clampInt(input.revealBudget?.requiredPrerequisiteClues, 0, 99, 0);
    const clueCount = clampInt(input.previousSnapshot?.prerequisiteClueCount, 0, 999, 0);
    const completedTasks = new Set(input.previousSnapshot?.completedTaskIds ?? []);
    const requiredTasks = input.revealBudget?.prerequisiteTaskIds ?? [];
    const missingTask = requiredTasks.find((taskId) => !completedTasks.has(taskId));
    if ((requiredClues > 0 && clueCount < requiredClues) || missingTask) {
      issues.push(
        issue(
          "major_reveal_prerequisite_missing",
          "high",
          `clues=${clueCount}/${requiredClues}${missingTask ? `|task=${missingTask}` : ""}`
        )
      );
    }
  }

  const crisisThreshold = clampInt(input.revealBudget?.maxConsecutiveCrisisTurns, 1, 12, 3);
  const crisisCount = clampInt(input.previousSnapshot?.consecutiveCrisisTurns, 0, 999, 0);
  const tensionDelta = input.candidate.tensionDelta ?? null;
  const crisisStillRising =
    candidateBeatState !== "aftermath" &&
    candidateBeatState !== "cooldown" &&
    input.candidate.crisis !== false &&
    (tensionDelta === null || tensionDelta >= 0);
  if (crisisCount >= crisisThreshold && crisisStillRising) {
    issues.push(
      issue(
        "crisis_chain_overflow",
        candidateBeatState === "peak" ? "high" : "medium",
        `count=${crisisCount}|threshold=${crisisThreshold}`
      )
    );
  }

  if (
    (input.candidate.isKeyChoiceResolution || input.previousSnapshot?.pendingChoiceConsequence) &&
    !hasMeaningfulDelta(input.stateDelta, input.candidate.dmChangeSet ?? null)
  ) {
    issues.push(issue("choice_without_consequence_delta", "high", "key choice resolved without structured delta"));
  }

  if (input.candidate.modelProposedBeatState) {
    issues.push(
      issue(
        "model_pacing_state_candidate",
        "low",
        `model_candidate=${input.candidate.modelProposedBeatState}`
      )
    );
  }

  const deduped = dedupeIssues(issues);
  const maxSeverity = maxSeverityOf(deduped);
  return {
    ok: maxSeverity !== "high" && maxSeverity !== "medium",
    issues: deduped,
    maxSeverity,
    telemetry: buildTelemetry({
      input,
      issues: deduped,
      previousBeatState,
      candidateBeatState,
      strongFactCount: strongFacts.length,
      majorRevealCount: hasMajorReveal ? Math.max(majorFacts.length, 1) : 0,
      allowedMajorRevealCount,
    }),
  };
}

/**
 * Self-Improving Agent System — Core Types
 *
 * Defines the complete data model for the eval-driven multi-agent
 * self-repair closed loop. All types live here as the single source
 * of truth for the orchestrator, state machine, scenario pool,
 * trace store, game runner, judge ensemble, defect triage,
 * repair plan, and quality gate.
 */

import type { ExperimentProvenance } from "@/lib/evals/harness/types";

// ── Run Identity ──────────────────────────────────────

export type SelfImproveProfile = "smoke" | "standard" | "deep";

export interface SelfImproveRunId {
  /** Unique run identifier, e.g. "si-20260730-001" */
  id: string;
  /** ISO timestamp of run start */
  startedAt: string;
  /** Profile controlling budget/iteration defaults */
  profile: SelfImproveProfile;
  /** Deterministic seed for reproducibility */
  seed: number;
}

// ── Budget ────────────────────────────────────────────

export interface SelfImproveBudget {
  /** Maximum repair iterations (default: smoke=3, standard=5, deep=10) */
  maxRounds: number;
  /** Maximum real (non-mock) model calls across all phases */
  maxLiveModelCalls: number;
  /** Maximum wall-clock minutes */
  maxDurationMinutes: number;
  /** Maximum concurrent game agents */
  gameConcurrency: number;
  /** Maximum concurrent judge calls */
  judgeConcurrency: number;
  /** Number of judges per scenario case */
  judgesPerCase: number;
  /** Minimum judge confidence for verdict acceptance */
  minimumJudgeConfidence: number;
  /** Required number of agreeing judges for auto-repair */
  requiredJudgeAgreement: number;
  /** Number of repeated live runs for non-deterministic scenarios */
  repeatedLiveRuns: number;
}

export const SMOKE_BUDGET: SelfImproveBudget = {
  maxRounds: 3,
  maxLiveModelCalls: 80,
  maxDurationMinutes: 60,
  gameConcurrency: 4,
  judgeConcurrency: 3,
  judgesPerCase: 3,
  minimumJudgeConfidence: 0.80,
  requiredJudgeAgreement: 2,
  repeatedLiveRuns: 3,
};

export const STANDARD_BUDGET: SelfImproveBudget = {
  maxRounds: 5,
  maxLiveModelCalls: 200,
  maxDurationMinutes: 120,
  gameConcurrency: 6,
  judgeConcurrency: 4,
  judgesPerCase: 3,
  minimumJudgeConfidence: 0.80,
  requiredJudgeAgreement: 2,
  repeatedLiveRuns: 3,
};

// ── Stop Conditions ───────────────────────────────────

export type StopReason =
  | "all_gates_passed"
  | "max_rounds_reached"
  | "budget_exhausted"
  | "no_improvement"
  | "consecutive_failures"
  | "judge_deadlock"
  | "human_review_required"
  | "live_blocked"
  | "regression_detected"
  | "user_interrupted";

export interface StopPolicy {
  /** Maximum total rounds before forced stop */
  maxRounds: number;
  /** Stop if no core score improvement for N consecutive rounds */
  noImprovementRounds: number;
  /** Stop if same defect fails repair N consecutive times */
  maxConsecutiveRepairFailures: number;
  /** Minimum live model coverage (0-1) to consider live eval valid */
  minLiveCoverage: number;
}

// ── Run State Machine ─────────────────────────────────

export type SelfImprovePhase =
  | "discovery"
  | "baseline"
  | "scenario_building"
  | "game_execution"
  | "judging"
  | "triage"
  | "repair"
  | "quality_gate"
  | "live_eval"
  | "reporting"
  | "stopped";

export type SelfImproveStatus =
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "blocked"
  | "failed";

export interface SelfImproveState {
  runId: SelfImproveRunId;
  phase: SelfImprovePhase;
  status: SelfImproveStatus;
  currentRound: number;
  budget: SelfImproveBudget;
  stopPolicy: StopPolicy;
  /** Total live model calls made so far */
  liveModelCallsUsed: number;
  /** ISO timestamp of run start */
  startedAt: string;
  /** ISO timestamp of last state update */
  updatedAt: string;
  /** Provenance snapshot at run start */
  provenance: ExperimentProvenance;
  /** Whether this is a resumed run */
  resumed: boolean;
  /** Previous run ID if resumed */
  resumedFromRunId?: string;
  /** ISO timestamp when the holdout corpus was last executed in this run */
  holdoutExecutedAt?: string | null;
}

// ── Scenario Pool ─────────────────────────────────────

export type ScenarioCategory =
  | "golden"
  | "regression"
  | "replay"
  | "boundary"
  | "property"
  | "fuzz";

export type ScenarioSource = "hand" | "synth" | "trace_replay" | "regression_defect";

export interface SelfImproveScenario {
  /** Unique case ID */
  caseId: string;
  /** Human-readable name */
  name: string;
  /** Category for filtering and reporting */
  category: ScenarioCategory;
  /** Source of this scenario */
  source: ScenarioSource;
  /** Whether this case is in the holdout (hidden) set */
  holdout: boolean;
  /** Tags for filtering */
  tags: string[];
  /** Difficulty level */
  difficulty: "basic" | "intermediate" | "advanced";
  /** Short description */
  description: string;
  /** The player action/input to send */
  playerInput: string;
  /** Expected behavior description (for deterministic oracle) */
  expectedBehavior: string;
  /** Expected invariant checks */
  expectedInvariants: SelfImproveInvariant[];
  /** Seed for deterministic execution */
  seed: number;
  /** Whether this requires live model (vs mock) */
  requiresLive: boolean;
}

export interface SelfImproveInvariant {
  id: string;
  description: string;
  /** What to check */
  check:
    | "action_legality"
    | "resource_conservation"
    | "npc_epistemic_boundary"
    | "state_narrative_consistency"
    | "option_executability"
    | "player_agency"
    | "task_lifecycle"
    | "forge_transaction"
    | "profession_boundary"
    | "idempotency"
    | "death_state_gating";
  /** Expected result */
  expected: "pass" | "fail";
  /** Severity if violated */
  severity: "critical" | "major" | "minor";
}

// ── Execution Trace ───────────────────────────────────

export interface SelfImproveTrace {
  /** Unique trace ID */
  traceId: string;
  runId: string;
  round: number;
  caseId: string;
  seed: number;
  /** Model info */
  model: string;
  provider: string;
  /** Timing */
  startedAt: string;
  endedAt: string;
  durationMs: number;
  /** Pre-turn state snapshot (JSON) */
  preState: Record<string, unknown>;
  /** Player input sent */
  playerInput: string;
  /** Injected facts snapshot */
  injectedFacts: string[];
  /** Raw model output */
  rawModelOutput: string;
  /** Parsed DM JSON */
  parsedDmJson: Record<string, unknown> | null;
  /** After normalization */
  normalizedDmJson: Record<string, unknown> | null;
  /** Validator output */
  validatorOutput: Record<string, unknown> | null;
  /** Proposed state delta */
  proposedStateDelta: Record<string, unknown> | null;
  /** Final approved state delta */
  finalStateDelta: Record<string, unknown> | null;
  /** Final committed state */
  finalState: Record<string, unknown> | null;
  /** Narrative text */
  narrative: string;
  /** Final player-visible options */
  options: string[];
  /** Errors encountered */
  errors: string[];
  /** Classification of errors (infra/model/parse/product); never breaks gameplay Oracle */
  errorClass?: string;
  /** retry/degrade/cache info */
  recoveryInfo: string | null;
  /** Token/latency info */
  tokenUsage: { prompt: number; completion: number; total: number } | null;
  latencyMs: number;
  /** Langfuse trace ID (set after upload). */
  langfuseTraceId?: string;
  /** Langfuse observation ID (set after upload). */
  langfuseObservationId?: string;
}

// ── Judge Ensemble ────────────────────────────────────

export type SpecializedJudgeRole =
  | "gameplay_legality"
  | "npc_fact_grounding"
  | "playability_agency";

export interface SelfImproveJudgeVerdict {
  caseId: string;
  judgeRole: SpecializedJudgeRole;
  judgeModel: string;
  passed: boolean;
  confidence: number;
  scores: {
    gameplayLegality: number;
    factSupport: number;
    epistemicBoundary: number;
    stateNarrativeConsistency: number;
    optionExecutability: number;
    playerAgency: number;
    playability: number;
  };
  violations: SelfImproveViolation[];
  inconclusive: boolean;
  inconclusiveReason?: string;
}

export interface SelfImproveViolation {
  category: string;
  ruleId: string;
  severity: "critical" | "major" | "minor";
  stepIndex: number;
  evidence: string;
  expected: string;
  actual: string;
  factId?: string;
  recommendedTests: string[];
}

// ── Defect Triage ─────────────────────────────────────

export interface DefectSignature {
  /** Stable fingerprint for dedup */
  fingerprint: string;
  category: string;
  ruleId: string;
  affectedSystem: string;
  normalizedExpected: string;
  normalizedActual: string;
}

export interface TriagedDefect {
  signature: DefectSignature;
  severity: "critical" | "major" | "minor";
  /** Source judge verdicts that identified this defect */
  sourceVerdicts: SelfImproveJudgeVerdict[];
  /** Whether deterministic oracle reproduced it */
  oracleReproduced: boolean;
  /** Whether sufficient evidence exists for auto-repair */
  autoRepairable: boolean;
  /** If not auto-repairable, why */
  blockReason?: string;
  /** Disposition */
  disposition:
    | "auto_repair"
    | "human_review_required"
    | "inconclusive"
    | "duplicate";
}

// ── Repair Plan ───────────────────────────────────────

export interface RepairPlan {
  defectSignature: DefectSignature;
  rootCause: string;
  candidateFiles: string[];
  approach: string;
  risks: string[];
  requiredTests: string[];
  impactOnNormalPlay: string;
  selected: boolean;
}

export interface RepairResult {
  defectSignature: DefectSignature;
  success: boolean;
  /** Added regression test paths */
  addedTests: string[];
  /** Modified production code paths */
  modifiedFiles: string[];
  /** Test-before evidence: did old code fail? */
  testFailedBeforeRepair: boolean;
  /** Did new test pass after repair? */
  testPassedAfterRepair: boolean;
  /** Did all regression tests pass? */
  regressionTestsPassed: boolean;
  /** Notes */
  notes: string;
  /** If repair was reverted */
  reverted: boolean;
  revertReason?: string;
}

// ── Quality Gate ──────────────────────────────────────

export interface QualityGateResult {
  round: number;
  timestamp: string;
  /** Deterministic test results */
  deterministicTests: {
    total: number;
    pass: number;
    fail: number;
    passRate: number;
    allPassed: boolean;
    /** Expectation match rate (0-1): how many invariants matched their expected outcome */
    expectationMatchRate: number;
    /** Positive case pass count */
    positiveCasesPassed: number;
    /** Expected rejection count observed */
    expectedRejectionsObserved: number;
    /** Unexpected failures count */
    unexpectedFailures: number;
    /** Unexpected passes count */
    unexpectedPasses: number;
  };
  /** New regression tests */
  newRegressionTests: {
    total: number;
    pass: number;
    allPassed: boolean;
  };
  /** Forward keep-alive tests */
  keepAliveTests: {
    total: number;
    pass: number;
    allPassed: boolean;
  };
  /** Required E2E and build */
  requiredE2e: {
    total: number;
    pass: number;
    allPassed: boolean;
  };
  buildPassed: boolean;
  /** Live eval results */
  liveEval: LiveEvalResult | null;
  /** Overall gate verdict */
  gatePassed: boolean;
  /** Blocker list if failed */
  blockers: string[];
}

export interface LiveEvalResult {
  /** Live model coverage (0-1) */
  coverage: number;
  /** Developer set results */
  devSet: {
    totalCases: number;
    passRate: number;
    criticalIssues: number;
    majorIssues: number;
    coreGameplayLegalityRate: number;
    npcFactViolations: number;
    stateNarrativeConflicts: number;
    averageJudgeScore: number;
  };
  /** Holdout set results (hidden from repair agent) */
  holdoutSet: {
    totalCases: number;
    passRate: number;
    criticalIssues: number;
    majorIssues: number;
    averageJudgeScore: number;
  };
  /** Whether holdout regressed vs baseline */
  holdoutRegressed: boolean;
  /** Regression details */
  regressionDetails: string[];
}

// ── Iteration Log ─────────────────────────────────────

export interface IterationLogEntry {
  round: number;
  phase: SelfImprovePhase;
  timestamp: string;
  scenarioCount: number;
  traceCount: number;
  defectsFound: number;
  defectsRepaired: number;
  repairsSucceeded: number;
  repairsFailed: number;
  qualityGateResult: QualityGateResult | null;
  stopReason: StopReason | null;
  notes: string;
}

// ── Final Report ──────────────────────────────────────

export type FinalStatus =
  | "PASS"
  | "BLOCKED"
  | "CLEAN_BUT_INSUFFICIENT_EVIDENCE"
  | "IMPLEMENTED_BUT_LIVE_BLOCKED"
  | "IMPLEMENTED_BUT_CALIBRATION_FAILED"
  | "BUDGET_EXHAUSTED"
  | "MAX_ROUNDS_REACHED"
  | "REGRESSION_DETECTED"
  | "FULL_REPAIR_LOOP_VERIFIED"
  | "LIVE_CAMPAIGN_PASS"
  | "HUMAN_RULE_DECISION_REQUIRED";

export interface FinalReport {
  /** Final status */
  status: FinalStatus;
  /** Run identity */
  runId: SelfImproveRunId;
  /** Complete architecture description */
  architecture: string;
  /** New and modified files */
  filesChanged: string[];
  /** New commands added to package.json */
  commandsAdded: string[];
  /** Baseline metrics */
  baseline: Record<string, unknown>;
  /** Final metrics */
  final: Record<string, unknown>;
  /** Per-round discoveries */
  roundDetails: {
    round: number;
    defectsFound: number;
    defectsRepaired: number;
    testsAdded: string[];
    rootCauses: string[];
  }[];
  /** Deterministic test final results */
  deterministicResults: Record<string, unknown>;
  /** Live eval final results */
  liveEvalResults: LiveEvalResult | null;
  /** Holdout regression check */
  holdoutRegressed: boolean;
  /** Resource usage */
  resourceUsage: {
    liveModelCalls: number;
    totalDurationMinutes: number;
    budget: SelfImproveBudget;
  };
  /** Stop condition reached */
  stopReason: StopReason;
  /** Unresolved issues */
  unresolvedIssues: string[];
  /** Human decision blocks */
  humanDecisionBlocks: string[];
  /** Git diff summary */
  gitDiffSummary: string;
}

// ── Langfuse Eval Integration Fields ──────────────────

// SelfImproveTrace already defined above; these fields are appended:
//   langfuseTraceId?: string;
//   langfuseObservationId?: string;
// They are optional — added to the interface definition inline below.

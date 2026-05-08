import type { SettlementGrade } from "@/lib/settlement/rules";

export type EndingOutcome =
  | "death"
  | "doom"
  | "true_escape"
  | "costly_escape"
  | "false_escape"
  | "abandon";

export type EndingPhase =
  | "playing"
  | "eligible"
  | "final_turn_pending"
  | "final_narrative_committing"
  | "settlement_ready"
  | "settled";

export type EndingFinalChoiceId =
  | "true_door"
  | "leave_with_npc"
  | "leave_alone"
  | "mirror_exit"
  | "embrace_doom";

export type EndingEligibilitySource =
  | "resolved_turn"
  | "player_stats"
  | "escape_mainline"
  | "time"
  | "manual";

export interface EndingEligibility {
  outcome: EndingOutcome;
  confidence: number;
  reasons: string[];
  blockers: string[];
  detectedAtTurn: number;
  source: EndingEligibilitySource;
  priority: number;
}

export interface EndingFinalChoice {
  id: EndingFinalChoiceId;
  label: string;
  description: string;
  outcome: EndingOutcome;
  selectedAt: string;
}

export interface EndingDeathContext {
  deathCause: string | null;
  deathLocation: string | null;
  lastAction: string | null;
}

export interface EndingFinalePayload {
  outcome: EndingOutcome;
  narrative: string;
  recalled: string[];
  options: string[];
  source: "ai" | "fallback";
}

export interface EndingSettlementSnapshot {
  v: 1;
  runId: string;
  settlementId: string;
  outcome: EndingOutcome;
  grade: SettlementGrade;
  title: string;
  caption: string;
  finalNarrative: string;
  survivalHours: number;
  survivalDay: number;
  survivalHour: number;
  maxFloorScore: number;
  maxFloorLabel: string;
  killedAnomalies: number;
  keyChoices: string[];
  obtainedClues: string[];
  npcEpilogues: string[];
  worldStateLines: string[];
  finalChoiceLabel?: string | null;
  deathCause?: string | null;
  deathLocation?: string | null;
  lastAction?: string | null;
  createdAt: string;
  writingMarkdown: string;
}

export interface EndingState {
  phase: EndingPhase;
  eligibility: EndingEligibility | null;
  finalChoice: EndingFinalChoice | null;
  deathContext: EndingDeathContext | null;
  finalNarrative: string | null;
  settlementSnapshot: EndingSettlementSnapshot | null;
  redirectedAt: string | null;
  settledAt: string | null;
  idempotencyKey: string | null;
}

export interface EndingLogEntry {
  role: string;
  content: string;
  reasoning?: string;
}

export interface EndingEvaluationInput {
  stats: { sanity?: number | null } & Record<string, unknown>;
  time: { day?: number | null; hour?: number | null };
  playerLocation: string;
  historicalMaxFloorScore: number;
  escapeMainline?: { stage?: unknown } | null;
  logs: EndingLogEntry[];
  turnCount: number;
  resolvedTurn?: {
    is_death?: unknown;
    death_cause?: unknown;
    deathCause?: unknown;
    player_location?: unknown;
  } | null;
  lastAction?: string | null;
  abandonRequested?: boolean;
}

export interface BuildEndingIdempotencyKeyInput {
  runId: string;
  outcome: EndingOutcome;
  detectedAtTurn: number;
}

export interface BuildSettlementSnapshotInput {
  runId: string;
  eligibility: EndingEligibility;
  stats: { sanity?: number | null } & Record<string, unknown>;
  time: { day?: number | null; hour?: number | null };
  playerLocation: string;
  historicalMaxFloorScore: number;
  logs: EndingLogEntry[];
  finalNarrative?: string | null;
  createdAt?: string;
  settlementId?: string;
  killedAnomalies?: number;
  keyChoices?: string[];
  obtainedClues?: string[];
  npcEpilogues?: string[];
  worldStateLines?: string[];
  finalChoice?: EndingFinalChoice | null;
  deathContext?: EndingDeathContext | null;
  writingMarkdown?: string;
}

export type EndingStateMachineEvent =
  | {
      type: "TURN_COMMITTED";
      runId: string;
      eligibility: EndingEligibility | null;
      deathContext?: EndingDeathContext | null;
    }
  | {
      type: "FINAL_ACTION_SELECTED";
      choice: EndingFinalChoice;
      at: string;
    }
  | {
      type: "FINAL_NARRATIVE_COMMITTED";
      narrative: string;
      at: string;
    }
  | {
      type: "SETTLEMENT_SNAPSHOT_CREATED";
      snapshot: EndingSettlementSnapshot | null;
      idempotencyKey?: string | null;
    }
  | {
      type: "REDIRECTED_TO_SETTLEMENT";
      at: string;
    }
  | {
      type: "SETTLED";
      at: string;
    }
  | {
      type: "RESET_FOR_NEW_RUN";
    };

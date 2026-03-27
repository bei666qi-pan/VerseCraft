export type BeatMode = "quiet" | "pressure" | "reveal" | "collision" | "countdown" | "peak" | "aftershock";

export type DirectorPressureFlag =
  | "stalling"
  | "high_threat"
  | "debt_pileup"
  | "promise_pileup"
  | "pending_incidents"
  | "hooks_ready";

export type StoryDirectorState = {
  v: 1;
  arcId: string;
  beatIndex: number;
  tension: number; // 0..100
  stallCount: number;
  lastProgressTurn: number;
  recentProgressTurns: number[];
  recentIncidentCodes: string[];
  recentPeakTurn: number;
  cooldowns: Record<string, number>; // code -> availableTurn
  openHookCodes: string[]; // short codes only
  falseCalmTurns: number;
  pressureBudget: number; // 0..100
  lastMandatoryIncidentTurn: number;
  escapePressureBand: "low" | "mid" | "high";
};

export type DirectorPlan = {
  beatMode: BeatMode;
  mustAdvance: boolean;
  mustRecallHookCodes: string[];
  preferredIncidentCode: string | null;
  softPressureHint: string | null;
  hardConstraint: string | null;
  suppressions: string[]; // incident codes to suppress this turn
  pressureFlags: DirectorPressureFlag[];
};

export type IncidentKind =
  | "pressure"
  | "deadline"
  | "npc_collision"
  | "route_block"
  | "reveal"
  | "repayment_due"
  | "environment_shift"
  | "false_safe_break"
  | "pursuit"
  | "resource_shock";

export type IncidentStatus = "queued" | "armed" | "fired" | "resolved" | "expired";

export type IncidentAnchors = {
  locationIds?: string[];
  npcIds?: string[];
  taskIds?: string[];
  floorIds?: string[];
  memoryMergeKeys?: string[];
  escapeTrackCodes?: string[];
};

export type IncidentEnvelope = {
  id: string;
  incidentCode: string;
  title: string;
  kind: IncidentKind;
  severity: "low" | "medium" | "high";
  source: "director" | "world_engine" | "task" | "npc" | "memory";
  scope: "run_private" | "location_local" | "npc_local" | "session_world";
  anchors: IncidentAnchors;
  dueTurn: number;
  expiresTurn: number;
  cooldownTurns: number;
  oneShot: boolean;
  status: IncidentStatus;
  payload?: Record<string, unknown>;
};

export type IncidentQueueState = {
  v: 1;
  items: IncidentEnvelope[];
};

export function createEmptyDirectorState(nowTurn: number): StoryDirectorState {
  return {
    v: 1,
    arcId: "arc_main",
    beatIndex: 0,
    tension: 18,
    stallCount: 0,
    lastProgressTurn: Math.max(0, nowTurn),
    recentProgressTurns: [],
    recentIncidentCodes: [],
    recentPeakTurn: Math.max(0, nowTurn - 99),
    cooldowns: {},
    openHookCodes: [],
    falseCalmTurns: 0,
    pressureBudget: 45,
    lastMandatoryIncidentTurn: Math.max(0, nowTurn - 99),
    escapePressureBand: "low",
  };
}

export function createEmptyIncidentQueue(): IncidentQueueState {
  return { v: 1, items: [] };
}


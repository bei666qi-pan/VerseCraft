export type EscapeStage =
  | "trapped"
  | "aware_exit_exists"
  | "route_fragmented"
  | "conditions_known"
  | "conditions_partially_met"
  | "final_window_open"
  | "escaped_true"
  | "escaped_false"
  | "escaped_costly"
  | "doomed";

export type EscapeFactorKind = "route_hint" | "escape_condition" | "access_grant" | "cost_or_sacrifice" | "false_lead";

export type EscapeConditionCode =
  | "get_exit_route_map"
  | "obtain_b2_access"
  | "secure_key_item"
  | "gain_trust_from_gatekeeper"
  | "survive_cost_trial"
  | "choose_sacrifice"
  | "invalidate_false_route";

export type EscapeCondition = {
  code: EscapeConditionCode;
  label: string;
  kind: EscapeFactorKind;
  required: boolean;
};

export type EscapeRouteFragment = {
  code: string;
  label: string;
  confidence: number; // 0..1
  anchors?: { locationIds?: string[]; npcIds?: string[]; taskIds?: string[] };
  source?: string;
};

export type EscapeBlocker = { code: string; label: string; severity: "low" | "medium" | "high" };
export type EscapeFalseLead = { code: string; label: string; anchors?: { locationIds?: string[]; npcIds?: string[] } };

export type EscapeFinalWindow = {
  open: boolean;
  dueTurn: number;
  expiresTurn: number;
  locationId: string | null;
  hint: string;
};

export type EscapeOutcomeHint = {
  outcome: "none" | "true_escape" | "false_escape" | "costly_escape" | "doom";
  title: string;
  toneLine: string;
};

export type EscapeMainlineState = {
  v: 1;
  stage: EscapeStage;
  routeFragments: EscapeRouteFragment[];
  knownConditions: EscapeCondition[];
  metConditions: EscapeConditionCode[];
  blockers: EscapeBlocker[];
  falseLeads: EscapeFalseLead[];
  allyRequirements: string[]; // npcId or role codes
  costRequirements: string[]; // short codes
  pendingFinalAction: string | null;
  finalWindow: EscapeFinalWindow;
  outcomeHint: EscapeOutcomeHint;
  lastAdvancedAtHour: number;
  lastChangedBy: string;
  historyDigest: string[];
};

export function createDefaultEscapeMainline(nowHour: number): EscapeMainlineState {
  return {
    v: 1,
    stage: "trapped",
    routeFragments: [],
    knownConditions: [],
    metConditions: [],
    blockers: [{ code: "unknown_exit", label: "你还不知道出口到底在哪里。", severity: "high" }],
    falseLeads: [],
    allyRequirements: [],
    costRequirements: [],
    pendingFinalAction: null,
    finalWindow: { open: false, dueTurn: 0, expiresTurn: 0, locationId: null, hint: "" },
    outcomeHint: { outcome: "none", title: "未逃离", toneLine: "" },
    lastAdvancedAtHour: Math.max(0, Math.trunc(nowHour ?? 0)),
    lastChangedBy: "system",
    historyDigest: [],
  };
}


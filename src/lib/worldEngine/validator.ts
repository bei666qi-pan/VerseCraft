import type { DirectorAgendaItem, DirectorPlan } from "./contracts";

export type DirectorValidationIssueSeverity = "low" | "medium" | "high";

export type DirectorValidationIssue = {
  code: string;
  message: string;
  severity: DirectorValidationIssueSeverity;
  eventCode?: string;
};

export type DirectorValidationResult = {
  accepted: boolean;
  acceptedEventCodes: string[];
  rejectedEventCodes: string[];
  issues: DirectorValidationIssue[];
};

const EVENT_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,79}$/;
const PRIVATE_HOOK_LEAK_RE =
  /player_private_hooks|must_not_surface_directly|hidden hook|private hook|隐藏伏笔|私有钩子|直接展示/i;

function textLen(s: unknown): number {
  return typeof s === "string" ? s.trim().length : 0;
}

function issue(
  code: string,
  message: string,
  severity: DirectorValidationIssueSeverity,
  eventCode?: string
): DirectorValidationIssue {
  return { code, message, severity, ...(eventCode ? { eventCode } : {}) };
}

function validateAgendaItem(ev: DirectorAgendaItem): DirectorValidationIssue[] {
  const issues: DirectorValidationIssue[] = [];
  if (!EVENT_CODE_RE.test(ev.event_code)) {
    issues.push(issue("invalid_event_code", "event_code must be stable ASCII code.", "high", ev.event_code));
  }
  if (textLen(ev.title) < 2) {
    issues.push(issue("missing_title", "title is required.", "high", ev.event_code));
  }
  if (textLen(ev.injection_hint) < 12) {
    issues.push(issue("weak_injection_hint", "injection_hint is too short or generic.", "high", ev.event_code));
  }
  if (ev.due_in_turns < 0 || ev.due_in_turns > 48 || ev.ttl_turns < 1 || ev.ttl_turns > 48) {
    issues.push(issue("invalid_due_ttl", "due/ttl turn window is out of range.", "high", ev.event_code));
  }
  if (!Array.isArray(ev.agency_constraints) || ev.agency_constraints.length === 0) {
    issues.push(issue("missing_agency_constraints", "event must preserve player agency.", "high", ev.event_code));
  }
  if (!Array.isArray(ev.forbidden_outcomes) || ev.forbidden_outcomes.length === 0) {
    issues.push(
      issue("missing_forbidden_outcomes", "event must define forbidden outcomes.", "high", ev.event_code)
    );
  }
  const joined = [
    ev.title,
    ev.injection_hint,
    ...(ev.trigger_conditions ?? []),
    ...(ev.agency_constraints ?? []),
    ...(ev.forbidden_outcomes ?? []),
  ].join("\n");
  if (PRIVATE_HOOK_LEAK_RE.test(joined)) {
    issues.push(
      issue("private_hook_leak", "agenda text appears to expose private hook semantics.", "high", ev.event_code)
    );
  }
  return issues;
}

export function validateDirectorPlan(plan: DirectorPlan): DirectorValidationResult {
  const issues: DirectorValidationIssue[] = [];
  if (plan.schema_version !== "director_plan_v1") {
    issues.push(issue("invalid_schema_version", "Director plan schema_version must be director_plan_v1.", "high"));
  }
  if (plan.risk_assessment.agency_risk === "high") {
    issues.push(issue("agency_risk_high", "High agency risk plans cannot create agenda.", "high"));
  }
  if (plan.risk_assessment.spoiler_risk === "high") {
    issues.push(issue("spoiler_risk_high", "High spoiler risk plans cannot create agenda.", "high"));
  }
  if (plan.risk_assessment.safety_risk === "high") {
    issues.push(issue("safety_risk_high", "High safety risk plans require deterministic rejection.", "high"));
  }

  const seen = new Set<string>();
  const acceptedEventCodes: string[] = [];
  const rejectedEventCodes: string[] = [];
  const planLevelReject = issues.some((x) => x.severity === "high");

  for (const ev of plan.world_events_to_schedule ?? []) {
    const itemIssues = validateAgendaItem(ev);
    if (seen.has(ev.event_code)) {
      itemIssues.push(issue("duplicate_event_code", "Duplicate event_code in one DirectorPlan.", "high", ev.event_code));
    }
    seen.add(ev.event_code);
    issues.push(...itemIssues);
    if (planLevelReject || itemIssues.some((x) => x.severity === "high")) {
      rejectedEventCodes.push(ev.event_code);
    } else {
      acceptedEventCodes.push(ev.event_code);
    }
  }

  for (const hook of plan.player_private_hooks ?? []) {
    if (hook.must_not_surface_directly !== true) {
      issues.push(issue("private_hook_contract_missing", "player_private_hooks must never be directly surfaced.", "high"));
    }
  }

  const hasHighIssue = issues.some((x) => x.severity === "high");
  return {
    accepted: !hasHighIssue,
    acceptedEventCodes: hasHighIssue ? [] : acceptedEventCodes,
    rejectedEventCodes: Array.from(new Set(rejectedEventCodes)),
    issues,
  };
}

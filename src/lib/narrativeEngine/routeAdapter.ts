import type { NarrativeValidationIssue, NarrativeValidationReport } from "./checker";
import type { TurnCommitSummary } from "./committer";
import type { NarrativeCheckIssue, NarrativeCheckResult } from "./checker";
import type { ModelOutputSchema } from "./schema";

const TURN_MODES = new Set<ModelOutputSchema["turnMode"]>([
  "narrative_only",
  "decision_required",
  "system_transition",
]);

const TIME_COSTS = new Set<NonNullable<ModelOutputSchema["stateChanges"]["timeCost"]>>([
  "free",
  "light",
  "standard",
  "heavy",
  "dangerous",
]);

export function buildRouteModelOutputFromResolvedTurn(args: {
  resolved: Record<string, unknown>;
  latestUserInput: string;
}): ModelOutputSchema {
  const narrative = nonEmptyString(args.resolved.narrative) ?? "Narrative response recorded.";
  const options = collectDecisionOptions(args.resolved);
  const stateChanges = {
    ...(stringOrNull(args.resolved.player_location)
      ? { playerLocation: stringOrNull(args.resolved.player_location) }
      : {}),
    ...(numberOrNull(args.resolved.sanity_delta) !== null
      ? { sanityDelta: numberOrNull(args.resolved.sanity_delta) }
      : numberOrNull(args.resolved.sanity_damage) !== null
        ? { sanityDelta: -Math.abs(numberOrNull(args.resolved.sanity_damage) ?? 0) }
        : {}),
    ...(numberOrNull(args.resolved.hp_delta) !== null
      ? { hpDelta: numberOrNull(args.resolved.hp_delta) }
      : numberOrNull(args.resolved.hp_change) !== null
        ? { hpDelta: numberOrNull(args.resolved.hp_change) }
        : {}),
    ...(numberOrNull(args.resolved.originium_delta) !== null
      ? { originiumDelta: numberOrNull(args.resolved.originium_delta) }
      : numberOrNull(args.resolved.currency_change) !== null
        ? { originiumDelta: numberOrNull(args.resolved.currency_change) }
        : {}),
    ...(coerceTimeCost(args.resolved.time_cost) ?? coerceConsumesTime(args.resolved.consumes_time)
      ? { timeCost: coerceTimeCost(args.resolved.time_cost) ?? coerceConsumesTime(args.resolved.consumes_time) }
      : {}),
    ...arrayRecordsField("taskUpdates", [
      ...arrayRecords(args.resolved.new_tasks),
      ...arrayRecords(args.resolved.task_updates),
    ]),
    ...arrayRecordsField("relationshipUpdates", arrayRecords(args.resolved.relationship_updates)),
    ...arrayRecordsField("npcLocationUpdates", arrayRecords(args.resolved.npc_location_updates)),
    ...arrayRecordsField("clueUpdates", arrayRecords(args.resolved.codex_updates)),
  } satisfies ModelOutputSchema["stateChanges"];

  return {
    narrative,
    turnMode: coerceTurnMode(args.resolved.turn_mode, options.length),
    decisionOptions: options,
    stateChanges,
    eventCandidates: [
      {
        type: "player_action",
        actorType: "player",
        actorId: "player",
        summary: clip(nonEmptyString(args.latestUserInput) ?? "Player submitted an action.", 180),
        payload: { source: "api_chat_resolved_turn" },
      },
      {
        type: "npc_reply",
        actorType: "system",
        actorId: null,
        summary: clip(narrative, 180),
        payload: { source: "api_chat_resolved_turn" },
      },
    ],
    revealAttempts: [],
    consistencyNotes: [],
  };
}

export function buildRouteNarrativeCheckResult(args: {
  output: ModelOutputSchema;
  validatorReport: NarrativeValidationReport;
  commitSummary: TurnCommitSummary;
}): NarrativeCheckResult {
  const issues = args.validatorReport.issues.map(routeIssueFromValidator);
  if (args.commitSummary.degraded && issues.length === 0) {
    issues.push({
      code: "legacy_commit_degraded",
      severity: "block",
      message: "Existing turn commit degraded the candidate output.",
    });
  }
  const hasBlock = issues.some((issue) => issue.severity === "block");
  return {
    ok: !hasBlock && !args.commitSummary.degraded,
    parsed: args.output,
    safeOutput: args.output,
    issues,
    ...(hasBlock || args.commitSummary.degraded
      ? { degradeReason: issues.find((issue) => issue.severity === "block")?.code ?? "legacy_commit_degraded" }
      : {}),
  };
}

function routeIssueFromValidator(issue: NarrativeValidationIssue): NarrativeCheckIssue {
  return {
    code: issue.code,
    severity: issue.severity === "high" ? "block" : issue.severity === "medium" ? "warn" : "info",
    message: issue.detail ? `${issue.code}:${issue.detail}` : issue.code,
    path: issue.anchor,
  };
}

function collectDecisionOptions(resolved: Record<string, unknown>): string[] {
  return [
    ...stringArray(resolved.options),
    ...stringArray(resolved.decision_options),
  ]
    .map((option) => option.trim())
    .filter(Boolean)
    .filter((option, index, all) => all.indexOf(option) === index)
    .slice(0, 4);
}

function coerceTurnMode(raw: unknown, optionCount: number): ModelOutputSchema["turnMode"] {
  if (typeof raw === "string" && TURN_MODES.has(raw as ModelOutputSchema["turnMode"])) {
    return raw as ModelOutputSchema["turnMode"];
  }
  return optionCount > 0 ? "decision_required" : "narrative_only";
}

function coerceTimeCost(raw: unknown): ModelOutputSchema["stateChanges"]["timeCost"] | null {
  if (typeof raw === "string" && TIME_COSTS.has(raw as NonNullable<ModelOutputSchema["stateChanges"]["timeCost"]>)) {
    return raw as NonNullable<ModelOutputSchema["stateChanges"]["timeCost"]>;
  }
  return null;
}

function coerceConsumesTime(raw: unknown): ModelOutputSchema["stateChanges"]["timeCost"] | null {
  if (raw === true) return "standard";
  if (raw === false) return "free";
  return null;
}

function arrayRecordsField<K extends "taskUpdates" | "relationshipUpdates" | "npcLocationUpdates" | "clueUpdates">(
  key: K,
  value: Record<string, unknown>[]
): Pick<ModelOutputSchema["stateChanges"], K> | Record<string, never> {
  return value.length > 0 ? ({ [key]: value } as Pick<ModelOutputSchema["stateChanges"], K>) : {};
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringOrNull(value: unknown): string | null {
  return nonEmptyString(value);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clip(value: string, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}...`;
}

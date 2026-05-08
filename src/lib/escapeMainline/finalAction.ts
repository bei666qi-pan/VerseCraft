import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import type {
  EscapeConditionCode,
  EscapeFinalActionDecision,
  EscapeMainlineState,
  EscapeOutcomeHint,
  EscapeStage,
} from "./types";
import { createDefaultEscapeMainline } from "./types";
import { createDefaultEscapeMainlineTemplate } from "./template";
import { deriveEscapeFactors, type EscapeDerivationInput } from "./derive";

export type ResolveEscapeFinalActionInput = {
  prevEscapeRaw: unknown;
  playerAction: string;
  resolvedTurn: any;
  nowTurn: number;
  nowHour: number;
  playerLocation: string;
  tasks: GameTaskV2[];
  codex: Record<string, any>;
  inventoryItemIds: string[];
  worldFlags: string[];
  memoryEntries: MemorySpineEntry[];
  changedBy?: string;
};

export type ResolveEscapeFinalActionFromStateInput = {
  prev: EscapeMainlineState;
  playerAction?: string;
  resolvedTurn: any;
  derived: EscapeDerivationInput;
  changedBy?: string;
};

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function asStringArray(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

function uniq(xs: readonly string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const text = String(x ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

function normalizePrevEscape(raw: unknown, nowHour: number): EscapeMainlineState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createDefaultEscapeMainlineTemplate(nowHour);
  }
  const o = raw as Record<string, unknown>;
  const base = createDefaultEscapeMainlineTemplate(nowHour);
  const stage = String(o.stage ?? base.stage) as EscapeStage;
  const safeStage: EscapeStage =
    stage === "trapped" ||
    stage === "aware_exit_exists" ||
    stage === "route_fragmented" ||
    stage === "conditions_known" ||
    stage === "conditions_partially_met" ||
    stage === "final_window_open" ||
    stage === "escaped_true" ||
    stage === "escaped_false" ||
    stage === "escaped_costly" ||
    stage === "doomed"
      ? stage
      : base.stage;

  return {
    ...base,
    ...o,
    v: 1,
    stage: safeStage,
    routeFragments: Array.isArray(o.routeFragments) ? (o.routeFragments as any[]).slice(0, 8) : base.routeFragments,
    knownConditions: Array.isArray(o.knownConditions) ? (o.knownConditions as any[]).slice(0, 16) : base.knownConditions,
    metConditions: asStringArray(o.metConditions, 12) as EscapeConditionCode[],
    blockers: Array.isArray(o.blockers) ? (o.blockers as any[]).slice(0, 8) : base.blockers,
    falseLeads: Array.isArray(o.falseLeads) ? (o.falseLeads as any[]).slice(0, 6) : base.falseLeads,
    allyRequirements: asStringArray(o.allyRequirements, 6),
    costRequirements: asStringArray(o.costRequirements, 6),
    pendingFinalAction: typeof o.pendingFinalAction === "string" ? o.pendingFinalAction : base.pendingFinalAction,
    finalWindow:
      o.finalWindow && typeof o.finalWindow === "object" && !Array.isArray(o.finalWindow)
        ? (o.finalWindow as EscapeMainlineState["finalWindow"])
        : base.finalWindow,
    outcomeHint:
      o.outcomeHint && typeof o.outcomeHint === "object" && !Array.isArray(o.outcomeHint)
        ? (o.outcomeHint as EscapeOutcomeHint)
        : base.outcomeHint,
    lastAdvancedAtHour: clampInt(o.lastAdvancedAtHour, 0, 999999),
    lastChangedBy: typeof o.lastChangedBy === "string" ? o.lastChangedBy : base.lastChangedBy,
    historyDigest: asStringArray(o.historyDigest, 18),
  };
}

function outcomeHint(outcome: EscapeOutcomeHint["outcome"]): EscapeOutcomeHint {
  if (outcome === "doom") return { outcome: "doom", title: "\u7ec8\u7109", toneLine: "\u6700\u7ec8\u7a97\u53e3\u5df2\u7ecf\u5173\u95ed\u3002" };
  if (outcome === "true_escape") return { outcome: "true_escape", title: "\u771f\u6b63\u9003\u79bb", toneLine: "\u4f60\u8d70\u51fa\u4e86\u771f\u6b63\u7684\u51fa\u53e3\u3002" };
  if (outcome === "false_escape") return { outcome: "false_escape", title: "\u5047\u9003\u79bb", toneLine: "\u4f60\u88ab\u9519\u8bef\u51fa\u53e3\u5e26\u5411\u66f4\u6df1\u5904\u3002" };
  if (outcome === "costly_escape") return { outcome: "costly_escape", title: "\u4ee3\u4ef7\u9003\u79bb", toneLine: "\u4f60\u8d70\u51fa\u4e86\u51fa\u53e3\uff0c\u4f46\u4ee3\u4ef7\u5df2\u7ecf\u53d1\u751f\u3002" };
  return { outcome: "none", title: "\u672a\u9003\u79bb", toneLine: "" };
}

function collectResolvedTurnTokens(resolvedTurn: any): { tokens: string[]; resolvedTokenCount: number } {
  const tokens: string[] = [];
  const finalAction = resolvedTurn?.escape_final_action;
  if (typeof finalAction === "string") {
    tokens.push(finalAction);
  } else if (finalAction && typeof finalAction === "object" && !Array.isArray(finalAction)) {
    for (const key of ["kind", "type", "outcome", "route", "action", "code", "id"]) {
      const value = (finalAction as Record<string, unknown>)[key];
      if (typeof value === "string") tokens.push(value);
    }
  }
  const resolvedTokenCount = tokens.length;
  tokens.push(...asStringArray(resolvedTurn?.world_flags, 32));
  tokens.push(...asStringArray(resolvedTurn?.worldFlags, 32));
  return { tokens, resolvedTokenCount };
}

function hasRegexMatch(tokens: readonly string[], needles: readonly RegExp[]): boolean {
  const text = tokens.join("\n").toLowerCase();
  return needles.some((needle) => needle.test(text));
}

function hasChinesePhrase(tokens: readonly string[], phrases: readonly string[]): boolean {
  const text = tokens.join("\n");
  return phrases.some((phrase) => text.includes(phrase));
}

function classifyFinalAction(args: {
  playerAction?: string;
  resolvedTurn: any;
  worldFlags: string[];
}): EscapeFinalActionDecision {
  const resolved = collectResolvedTurnTokens(args.resolvedTurn);
  const worldFlagTokens = asStringArray(args.worldFlags, 128);
  const playerText = String(args.playerAction ?? "").trim();
  const tokens = [...resolved.tokens, ...worldFlagTokens, playerText].filter(Boolean);
  const matchedBy: EscapeFinalActionDecision["matchedBy"] =
    resolved.resolvedTokenCount > 0
      ? "resolved_turn"
      : hasRegexMatch(worldFlagTokens, [/escape[_:. -]?final/, /true_escape|costly_escape|false_escape|mirror_exit|fake_exit/])
        ? "world_flag"
        : playerText
          ? "player_text"
          : "none";

  if (
    hasRegexMatch(tokens, [
      /false[_:. -]?escape|escaped_false|false[_:. -]?exit|fake[_:. -]?exit|false[_:. -]?route|mirror[_:. -]?exit/,
    ]) ||
    hasChinesePhrase(tokens, ["\u5047\u51fa\u53e3", "\u955c\u4e2d\u51fa\u53e3", "\u955c\u9762\u51fa\u53e3", "\u76f8\u4fe1\u955c\u4e2d\u51fa\u53e3"])
  ) {
    return { kind: "false_exit", matchedBy, reasons: ["matched_false_exit_action"] };
  }

  if (
    hasRegexMatch(tokens, [
      /costly[_:. -]?escape|escaped_costly|costly[_:. -]?exit|sacrifice|pollution|low[_:. -]?sanity|choose_sacrifice|cost[_:. -]?paid/,
    ]) ||
    hasChinesePhrase(tokens, ["\u727a\u7272", "\u4ea4\u6362", "\u4ee3\u4ef7\u901a\u8fc7", "\u4ed8\u51fa\u4ee3\u4ef7"])
  ) {
    return { kind: "costly_exit", matchedBy, reasons: ["matched_costly_exit_action"] };
  }

  if (
    hasRegexMatch(tokens, [
      /true[_:. -]?escape|escaped_true|true[_:. -]?exit|real[_:. -]?exit|perform_escape_action_at_gate|open_true_gate/,
    ]) ||
    hasChinesePhrase(tokens, ["\u63a8\u5f00\u771f\u6b63\u7684\u95e8", "\u7a7f\u8fc7\u51fa\u53e3", "\u8fdb\u5165\u6700\u7ec8\u7a97\u53e3", "\u771f\u6b63\u51fa\u53e3"])
  ) {
    return { kind: "true_exit", matchedBy, reasons: ["matched_true_exit_action"] };
  }

  return { kind: "none", matchedBy: "none", reasons: [] };
}

function hasFlag(flags: readonly string[], patterns: readonly RegExp[]): boolean {
  return hasRegexMatch(flags, patterns);
}

function isFalseRouteExcluded(args: {
  met: Set<string>;
  worldFlags: string[];
  resolvedTurn: any;
}): boolean {
  const flags = [
    ...args.worldFlags,
    ...asStringArray(args.resolvedTurn?.world_flags, 32),
    ...asStringArray(args.resolvedTurn?.worldFlags, 32),
  ];
  return (
    args.met.has("invalidate_false_route") ||
    hasFlag(flags, [/invalidate_false_route|false_route_invalidated|escape:false_route_invalidated|false[_:. -]?lead[_:. -]?resolved/])
  );
}

function buildUnmetRequiredConditionCodes(args: {
  prev: EscapeMainlineState;
  factors: ReturnType<typeof deriveEscapeFactors>;
}): string[] {
  const met = new Set([...(args.prev.metConditions ?? []), ...(args.factors.conditionMetCodes ?? [])].map(String));
  const required = (args.prev.knownConditions ?? []).filter((condition) => condition.required);
  const routeReady =
    met.has("get_exit_route_map") ||
    (args.prev.routeFragments ?? []).length >= 2 ||
    (args.factors.routeHintCodes ?? []).length >= 2;
  return required
    .filter((condition) => {
      if (condition.code === "get_exit_route_map") return !routeReady;
      return !met.has(condition.code);
    })
    .map((condition) => condition.code);
}

function appendHistory(prev: EscapeMainlineState, entries: string[]): string[] {
  return uniq([...(prev.historyDigest ?? []), ...entries], 18);
}

function withFinalStage(input: {
  prev: EscapeMainlineState;
  stage: EscapeMainlineState["stage"];
  outcome: EscapeOutcomeHint["outcome"];
  nowHour: number;
  changedBy: string;
  history: string[];
}): EscapeMainlineState {
  return {
    ...input.prev,
    stage: input.stage,
    finalWindow: { ...(input.prev.finalWindow ?? createDefaultEscapeMainline(input.nowHour).finalWindow), open: false },
    outcomeHint: outcomeHint(input.outcome),
    blockers: [],
    pendingFinalAction: null,
    lastAdvancedAtHour: input.nowHour,
    lastChangedBy: input.changedBy,
    historyDigest: appendHistory(input.prev, input.history),
  };
}

export function resolveEscapeFinalActionFromState(input: ResolveEscapeFinalActionFromStateInput): EscapeMainlineState {
  const prev = input.prev;
  if (prev.stage !== "final_window_open") return prev;

  const expiresTurn = Number(prev.finalWindow?.expiresTurn ?? 0);
  if (expiresTurn > 0 && input.derived.nowTurn > expiresTurn) {
    return withFinalStage({
      prev,
      stage: "doomed",
      outcome: "doom",
      nowHour: input.derived.nowHour,
      changedBy: input.changedBy ?? "escape_final_action",
      history: [`stage:${prev.stage}->doomed`, "final_window_expired"],
    });
  }

  const factors = deriveEscapeFactors(input.derived);
  const decision = classifyFinalAction({
    playerAction: input.playerAction,
    resolvedTurn: input.resolvedTurn,
    worldFlags: input.derived.worldFlags,
  });
  if (decision.kind === "none") {
    const blocker = {
      code: "final_action_missing",
      label: "Final window is open, but the final escape action has not been committed.",
      severity: "medium" as const,
    };
    return {
      ...prev,
      blockers: [blocker, ...(prev.blockers ?? []).filter((b) => b.code !== blocker.code)].slice(0, 8),
      lastAdvancedAtHour: input.derived.nowHour,
      lastChangedBy: input.changedBy ?? "escape_final_action",
      historyDigest: appendHistory(prev, ["final_action_missing"]),
    };
  }

  const met = new Set([...(prev.metConditions ?? []), ...(factors.conditionMetCodes ?? [])].map(String));
  const falseLeadCodes = uniq([...(prev.falseLeads ?? []).map((lead) => lead.code), ...(factors.falseLeadCodes ?? [])], 8);
  const falseRouteUnexcluded =
    falseLeadCodes.length > 0 &&
    !isFalseRouteExcluded({ met, worldFlags: input.derived.worldFlags, resolvedTurn: input.resolvedTurn });

  if (decision.kind === "false_exit" || falseRouteUnexcluded) {
    return withFinalStage({
      prev,
      stage: "escaped_false",
      outcome: "false_escape",
      nowHour: input.derived.nowHour,
      changedBy: input.changedBy ?? "escape_final_action",
      history: [`stage:${prev.stage}->escaped_false`, ...decision.reasons, ...(falseRouteUnexcluded ? ["false_route_unexcluded"] : [])],
    });
  }

  const unmetRequired = buildUnmetRequiredConditionCodes({ prev, factors });
  if (unmetRequired.length > 0) {
    return {
      ...prev,
      blockers: unmetRequired.slice(0, 6).map((code) => ({
        code: `unmet:${code}`,
        label: `Final escape action is blocked because ${code} is not met.`,
        severity: "high" as const,
      })),
      lastAdvancedAtHour: input.derived.nowHour,
      lastChangedBy: input.changedBy ?? "escape_final_action",
      historyDigest: appendHistory(prev, [`final_action_blocked:${unmetRequired.join(",")}`]),
    };
  }

  const costlyByState =
    decision.kind === "costly_exit" ||
    met.has("choose_sacrifice") ||
    (prev.costRequirements ?? []).length > 0 ||
    hasFlag(input.derived.worldFlags, [/sacrifice|pollution|cost[_:. -]?paid|low[_:. -]?sanity|costly_escape/]);

  if (costlyByState) {
    return withFinalStage({
      prev,
      stage: "escaped_costly",
      outcome: "costly_escape",
      nowHour: input.derived.nowHour,
      changedBy: input.changedBy ?? "escape_final_action",
      history: [`stage:${prev.stage}->escaped_costly`, ...decision.reasons],
    });
  }

  return withFinalStage({
    prev,
    stage: "escaped_true",
    outcome: "true_escape",
    nowHour: input.derived.nowHour,
    changedBy: input.changedBy ?? "escape_final_action",
    history: [`stage:${prev.stage}->escaped_true`, ...decision.reasons],
  });
}

export function resolveEscapeFinalAction(input: ResolveEscapeFinalActionInput): EscapeMainlineState {
  const prev = normalizePrevEscape(input.prevEscapeRaw, input.nowHour);
  const derived: EscapeDerivationInput = {
    nowHour: input.nowHour,
    nowTurn: input.nowTurn,
    playerLocation: input.playerLocation,
    tasks: input.tasks,
    codex: input.codex,
    inventoryItemIds: input.inventoryItemIds,
    worldFlags: input.worldFlags,
    memoryEntries: input.memoryEntries,
  };
  return resolveEscapeFinalActionFromState({
    prev,
    playerAction: input.playerAction,
    resolvedTurn: input.resolvedTurn,
    derived,
    changedBy: input.changedBy,
  });
}

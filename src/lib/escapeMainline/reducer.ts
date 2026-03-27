import type { EscapeMainlineState, EscapeStage, EscapeConditionCode, EscapeFalseLead, EscapeRouteFragment } from "./types";
import { createDefaultEscapeMainline } from "./types";
import { createDefaultEscapeMainlineTemplate } from "./template";
import type { EscapeDerivationInput } from "./derive";
import { deriveEscapeFactors } from "./derive";

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function uniq<T>(xs: T[], cap: number, keyFn: (x: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const k = keyFn(x);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= cap) break;
  }
  return out;
}

function asCodeList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = typeof x === "string" ? x.trim() : "";
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

export function normalizeEscapeMainline(raw: unknown, nowHour: number): EscapeMainlineState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createDefaultEscapeMainlineTemplate(nowHour);
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
    metConditions: asCodeList(o.metConditions, 12) as EscapeConditionCode[],
    blockers: Array.isArray(o.blockers) ? (o.blockers as any[]).slice(0, 8) : base.blockers,
    falseLeads: Array.isArray(o.falseLeads) ? (o.falseLeads as any[]).slice(0, 6) : base.falseLeads,
    allyRequirements: asCodeList(o.allyRequirements, 6),
    costRequirements: asCodeList(o.costRequirements, 6),
    pendingFinalAction: typeof o.pendingFinalAction === "string" ? o.pendingFinalAction : base.pendingFinalAction,
    finalWindow: (o.finalWindow && typeof o.finalWindow === "object" && !Array.isArray(o.finalWindow))
      ? (o.finalWindow as any)
      : base.finalWindow,
    outcomeHint: (o.outcomeHint && typeof o.outcomeHint === "object" && !Array.isArray(o.outcomeHint))
      ? (o.outcomeHint as any)
      : base.outcomeHint,
    lastAdvancedAtHour: clampInt(o.lastAdvancedAtHour, 0, 999999),
    lastChangedBy: typeof o.lastChangedBy === "string" ? o.lastChangedBy : base.lastChangedBy,
    historyDigest: asCodeList(o.historyDigest, 18),
  } as EscapeMainlineState;
}

function computeStageFromFactors(prev: EscapeMainlineState, factors: ReturnType<typeof deriveEscapeFactors>): EscapeStage {
  const met = new Set(factors.conditionMetCodes);
  const blockers = factors.blockers;
  const routeOk = factors.routeHintCodes.length >= 2;
  const conditionsKnown = (prev.knownConditions ?? []).length >= 4;
  const reqAllMet =
    met.has("obtain_b2_access") &&
    met.has("secure_key_item") &&
    met.has("gain_trust_from_gatekeeper") &&
    met.has("survive_cost_trial");

  if (prev.stage === "escaped_true" || prev.stage === "escaped_false" || prev.stage === "escaped_costly") return prev.stage;
  if (prev.stage === "doomed") return "doomed";

  if (factors.pendingFinalAction && reqAllMet) return "final_window_open";
  if (reqAllMet) return "conditions_partially_met";
  if (routeOk && conditionsKnown) return "conditions_known";
  if (routeOk) return "route_fragmented";
  if (factors.routeHintCodes.length >= 1) return "aware_exit_exists";
  if (blockers.length === 0) return "conditions_partially_met";
  return "trapped";
}

export function advanceEscapeMainlineFromState(input: {
  prev: EscapeMainlineState;
  derived: EscapeDerivationInput;
  resolvedTurn: any;
  changedBy: string;
}): EscapeMainlineState {
  const prev = input.prev ?? createDefaultEscapeMainlineTemplate(input.derived.nowHour);
  const factors = deriveEscapeFactors(input.derived);
  const nextStage = computeStageFromFactors(prev, factors);

  const routeFragments: EscapeRouteFragment[] = uniq(
    [
      ...(prev.routeFragments ?? []),
      ...factors.routeHintCodes.map((c) => ({ code: c, label: "路线碎片", confidence: 0.62 })),
    ],
    8,
    (x) => x.code
  );
  const falseLeads: EscapeFalseLead[] = uniq(
    [
      ...(prev.falseLeads ?? []),
      ...factors.falseLeadCodes.map((c) => ({ code: c, label: "可疑的假出口" })),
    ],
    6,
    (x) => x.code
  );

  const metConditions = uniq(
    [...(prev.metConditions ?? []), ...(factors.conditionMetCodes as any)],
    12,
    (x) => String(x)
  ) as any as EscapeConditionCode[];

  const finalWindow = (() => {
    if (nextStage !== "final_window_open") return prev.finalWindow ?? createDefaultEscapeMainline(input.derived.nowHour).finalWindow;
    const due = input.derived.nowTurn;
    return {
      open: true,
      dueTurn: due,
      expiresTurn: due + 2,
      locationId: input.derived.playerLocation?.startsWith("B2_") ? input.derived.playerLocation : "B2_GatekeeperDomain",
      hint: "窗口已开：要么现在完成最后动作，要么错过。",
    };
  })();

  const outcomeHint = (() => {
    if (prev.outcomeHint?.outcome && prev.outcomeHint.outcome !== "none") return prev.outcomeHint;
    if (nextStage === "doomed") return { outcome: "doom", title: "终焉", toneLine: "末日闸门落下，你没能走出去。" };
    if (nextStage === "escaped_true") return { outcome: "true_escape", title: "真正逃离", toneLine: "你走出去了——这一次是真正的出口。" };
    if (nextStage === "escaped_false") return { outcome: "false_escape", title: "假逃离", toneLine: "你以为走出去，但你只是被引向更深的胃壁。" };
    if (nextStage === "escaped_costly") return { outcome: "costly_escape", title: "代价逃离", toneLine: "你走出去了，但你永远失去了一部分东西。" };
    return prev.outcomeHint ?? { outcome: "none", title: "未逃离", toneLine: "" };
  })();

  const historyDigest = uniq(
    [
      ...(prev.historyDigest ?? []),
      nextStage !== prev.stage ? `stage:${prev.stage}->${nextStage}` : "",
      ...(factors.conditionMetCodes.map((c) => `met:${c}`) ?? []),
    ].filter((x) => typeof x === "string" && x.trim().length > 0) as string[],
    18,
    (x) => x
  );

  return {
    ...prev,
    stage: nextStage,
    routeFragments,
    metConditions,
    blockers: factors.blockers,
    falseLeads,
    pendingFinalAction: factors.pendingFinalAction,
    finalWindow,
    outcomeHint,
    lastAdvancedAtHour: input.derived.nowHour,
    lastChangedBy: input.changedBy,
    historyDigest,
  };
}


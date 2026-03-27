import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { detectDirectorSignals } from "./signals";
import { planStoryBeat } from "./planner";
import { buildIncidentFromTemplate, INCIDENT_REGISTRY } from "./registry";
import {
  advanceIncidentQueue,
  buildIncidentDigest,
  enqueueIncident,
  markIncidentFired,
  normalizeIncidentQueue,
  selectIncidentForTurn,
} from "./queue";
import {
  createEmptyDirectorState,
  createEmptyIncidentQueue,
  type DirectorPlan,
  type IncidentEnvelope,
  type IncidentQueueState,
  type StoryDirectorState,
} from "./types";

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

export function normalizeDirectorState(raw: unknown, nowTurn: number): StoryDirectorState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createEmptyDirectorState(nowTurn);
  const o = raw as Record<string, unknown>;
  const base = createEmptyDirectorState(nowTurn);
  return {
    ...base,
    v: 1,
    arcId: typeof o.arcId === "string" && o.arcId ? o.arcId : base.arcId,
    beatIndex: clampInt(o.beatIndex, 0, 999999),
    tension: clampInt(o.tension, 0, 100),
    stallCount: clampInt(o.stallCount, 0, 99),
    lastProgressTurn: clampInt(o.lastProgressTurn, 0, 999999),
    recentProgressTurns: Array.isArray(o.recentProgressTurns) ? uniq(o.recentProgressTurns as any, 8).map((x) => clampInt(Number(x), 0, 999999)) : [],
    recentIncidentCodes: Array.isArray(o.recentIncidentCodes) ? uniq(o.recentIncidentCodes as any, 10) : [],
    recentPeakTurn: clampInt(o.recentPeakTurn, 0, 999999),
    cooldowns: o.cooldowns && typeof o.cooldowns === "object" && !Array.isArray(o.cooldowns) ? (o.cooldowns as any) : {},
    openHookCodes: Array.isArray(o.openHookCodes) ? uniq(o.openHookCodes as any, 12) : [],
    falseCalmTurns: clampInt(o.falseCalmTurns, 0, 99),
    pressureBudget: clampInt(o.pressureBudget, 0, 100),
    lastMandatoryIncidentTurn: clampInt(o.lastMandatoryIncidentTurn, 0, 999999),
    escapePressureBand: o.escapePressureBand === "high" || o.escapePressureBand === "mid" ? (o.escapePressureBand as any) : "low",
  };
}

export function postTurnStoryDirectorUpdate(args: {
  directorRaw: unknown;
  incidentQueueRaw: unknown;
  nowTurn: number;
  pre: {
    playerLocation: string;
    tasks: GameTaskV2[];
    mainThreatByFloor: Record<string, { phase?: string }>;
    memoryEntries: MemorySpineEntry[];
  };
  post: {
    playerLocation: string;
    tasks: GameTaskV2[];
    mainThreatByFloor: Record<string, { phase?: string }>;
    memoryEntries: MemorySpineEntry[];
  };
  resolvedTurn: any;
}): {
  director: StoryDirectorState;
  plan: DirectorPlan;
  incidentQueue: IncidentQueueState;
  armedIncident: IncidentEnvelope | null;
  incidentDigest: { pendingCodes: string[]; armedCodes: string[] };
} {
  const nowTurn = Math.max(0, Math.trunc(args.nowTurn ?? 0));
  const director0 = normalizeDirectorState(args.directorRaw, nowTurn);
  const queue0 = normalizeIncidentQueue(args.incidentQueueRaw);

  const signals = detectDirectorSignals({
    director: director0,
    nowTurn,
    pre: args.pre,
    post: args.post,
    resolvedTurn: args.resolvedTurn,
  });

  // 更新 stall / tension / budget（确定性）
  const progressed = signals.progressed;
  const stalled = signals.stalled;
  const stallCount = progressed ? Math.max(0, director0.stallCount - 1) : stalled ? director0.stallCount + 1 : director0.stallCount;
  const tensionBase = director0.tension;
  const tension =
    progressed
      ? clampInt(tensionBase - 4, 0, 100)
      : stalled
        ? clampInt(tensionBase + 6, 0, 100)
        : clampInt(tensionBase + (signals.highPressure ? 3 : 0), 0, 100);
  const falseCalmTurns =
    signals.highPressure ? 0 : progressed ? director0.falseCalmTurns : clampInt(director0.falseCalmTurns + 1, 0, 99);

  const pressureBudget = clampInt(
    director0.pressureBudget +
      (progressed ? 6 : 0) +
      (stalled ? -8 : 0) +
      (signals.highPressure ? -3 : 0),
    0,
    100
  );

  const director1: StoryDirectorState = {
    ...director0,
    stallCount,
    tension,
    falseCalmTurns,
    pressureBudget,
    lastProgressTurn: progressed ? nowTurn : director0.lastProgressTurn,
    recentProgressTurns: progressed ? uniq([nowTurn, ...(director0.recentProgressTurns ?? [])], 8).map((x) => Number(x)) : director0.recentProgressTurns,
    beatIndex: director0.beatIndex + 1,
    escapePressureBand: tension >= 70 ? "high" : tension >= 40 ? "mid" : "low",
  };

  const plan = planStoryBeat({ director: director1, signals });

  // 先推进队列：queued -> armed / expired
  const { queue: queue1 } = advanceIncidentQueue({ queue: queue0, director: director1, nowTurn });

  // 决定是否需要“排队新事件”（预算制 + 冷却制）
  let queue2 = queue1;
  const canSchedule =
    nowTurn - (director1.lastMandatoryIncidentTurn ?? 0) >= 2 || plan.mustAdvance;
  const inPeakCooldown = nowTurn - (director1.recentPeakTurn ?? 0) <= 1;
  const shouldScheduleAny = canSchedule && !inPeakCooldown && (plan.beatMode === "pressure" || plan.beatMode === "countdown" || plan.beatMode === "peak");

  if (shouldScheduleAny) {
    const preferred = plan.preferredIncidentCode;
    const candidates = uniq(
      [
        ...(preferred ? [preferred] : []),
        ...Object.keys(INCIDENT_REGISTRY),
      ],
      12
    );
    for (const code of candidates) {
      if (plan.suppressions.includes(code)) continue;
      const tpl = INCIDENT_REGISTRY[code];
      if (!tpl) continue;
      const cdUntil = Number(director1.cooldowns?.[code] ?? 0);
      if (Number.isFinite(cdUntil) && cdUntil > nowTurn) continue;
      if (!tpl.shouldTrigger({ director: director1, signals })) continue;
      const inc = buildIncidentFromTemplate({ templateCode: code, nowTurn, director: director1, signals });
      if (!inc) continue;
      queue2 = enqueueIncident(queue2, inc, { maxItems: 10 });
      break; // 本回合最多排 1 条新事件
    }
  }

  // 再次推进队列，确保 due=now 的新事件可以立刻 armed
  const { queue: queue3 } = advanceIncidentQueue({ queue: queue2, director: director1, nowTurn });
  const armedIncident = selectIncidentForTurn({
    director: director1,
    queue: queue3,
    nowTurn,
    preferredIncidentCode: plan.preferredIncidentCode,
    suppressions: plan.suppressions,
  });

  const queue4 = armedIncident ? markIncidentFired(queue3, armedIncident.id) : queue3;

  const director2: StoryDirectorState = {
    ...director1,
    recentIncidentCodes: armedIncident
      ? uniq([armedIncident.incidentCode, ...(director1.recentIncidentCodes ?? [])], 10)
      : director1.recentIncidentCodes,
    recentPeakTurn: plan.beatMode === "peak" || (armedIncident && armedIncident.severity === "high")
      ? nowTurn
      : director1.recentPeakTurn,
    lastMandatoryIncidentTurn: armedIncident ? nowTurn : director1.lastMandatoryIncidentTurn,
    cooldowns: armedIncident
      ? { ...(director1.cooldowns ?? {}), [armedIncident.incidentCode]: nowTurn + clampInt(armedIncident.cooldownTurns, 0, 99) }
      : director1.cooldowns,
  };

  const digest = buildIncidentDigest(queue4, nowTurn);
  return {
    director: director2,
    plan,
    incidentQueue: queue4,
    armedIncident,
    incidentDigest: digest,
  };
}


import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import { sanitizeChapterTitleCandidate, toChineseChapterOrder } from "@/lib/chapters/title";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { detectDirectorSignals } from "./signals";
import { evaluateChapterCloseDecision, planChapterStep } from "./chapterReasoner";
import { recordChapterReasonerTrace } from "./chapterTrace";
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
  createInitialChapterDirectorState,
  type ChapterCloseDecision,
  type ChapterDirectorState,
  type ChapterPhase,
  type DirectorPlan,
  type IncidentEnvelope,
  type IncidentQueueState,
  type NextChapterSeed,
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

export type ChapterBridgeInput = Partial<Pick<
  ChapterDirectorState,
  | "currentChapterId"
  | "chapterOrder"
  | "chapterTitle"
  | "promise"
  | "mainQuestion"
  | "emotionalTone"
  | "minTurns"
  | "targetTurns"
  | "softMaxTurns"
>> | null | undefined;

const CHAPTER_PHASES: readonly ChapterPhase[] = [
  "opening",
  "rising",
  "choice",
  "echo",
  "reveal",
  "aftershock",
  "closing",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampText(value: unknown, max: number, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.length <= max ? text : text.slice(0, max);
}

function uniqUnknownStrings(value: unknown, cap: number): string[] {
  return uniq(Array.isArray(value) ? (value as unknown[]).map((x) => String(x ?? "")) : [], cap);
}

function normalizeChapterPhase(value: unknown, fallback: ChapterPhase): ChapterPhase {
  return typeof value === "string" && (CHAPTER_PHASES as readonly string[]).includes(value)
    ? (value as ChapterPhase)
    : fallback;
}

function normalizeTargetTurns(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  const lo = clampInt(value[0], 1, 999);
  const hi = Math.max(lo, clampInt(value[1], lo, 999));
  return [lo, hi];
}

function normalizeCloseDecision(raw: unknown): ChapterCloseDecision | null {
  const o = asRecord(raw);
  if (!o) return null;
  return {
    shouldClose: o.shouldClose === true,
    confidence: clamp01(o.confidence),
    hasResolvedSmallQuestion: o.hasResolvedSmallQuestion === true,
    hasNewHook: o.hasNewHook === true,
    hasPlayerChoiceEcho: o.hasPlayerChoiceEcho === true,
    hasReadablePause: o.hasReadablePause === true,
    hasNoLoreConflict: o.hasNoLoreConflict !== false,
    reason: clampText(o.reason, 180),
    playerRecapCandidate: clampText(o.playerRecapCandidate, 360),
    modelSummaryCandidate: clampText(o.modelSummaryCandidate, 420),
    nextChapterTitleCandidate: clampText(o.nextChapterTitleCandidate, 80) || null,
  };
}

function normalizeNextChapterSeed(raw: unknown): NextChapterSeed | null {
  const o = asRecord(raw);
  if (!o) return null;
  const title = clampText(o.title, 80);
  const promise = clampText(o.promise, 180);
  const mainQuestion = clampText(o.mainQuestion, 180);
  if (!title || !promise || !mainQuestion) return null;
  return {
    title,
    promise,
    mainQuestion,
    emotionalTone: clampText(o.emotionalTone, 120, "悬疑、克制、余波未散"),
    mustEchoMemoryIds: uniqUnknownStrings(o.mustEchoMemoryIds, 8),
    inheritedThreadIds: uniqUnknownStrings(o.inheritedThreadIds, 12),
  };
}

function applyChapterBridge(
  chapter: ChapterDirectorState,
  bridge: ChapterBridgeInput,
  nowTurn: number
): ChapterDirectorState {
  if (!bridge) return chapter;
  const bridgeId = clampText(bridge.currentChapterId, 80);
  if (bridgeId && bridgeId !== chapter.currentChapterId) {
    return createInitialChapterDirectorState(nowTurn, {
      currentChapterId: bridgeId,
      chapterOrder: bridge.chapterOrder,
      chapterTitle: bridge.chapterTitle,
      promise: bridge.promise,
      mainQuestion: bridge.mainQuestion,
      emotionalTone: bridge.emotionalTone,
      minTurns: bridge.minTurns,
      targetTurns: bridge.targetTurns,
      softMaxTurns: bridge.softMaxTurns,
    });
  }
  return {
    ...chapter,
    currentChapterId: bridgeId || chapter.currentChapterId,
    chapterOrder:
      typeof bridge.chapterOrder === "number" && Number.isFinite(bridge.chapterOrder)
        ? Math.max(1, Math.trunc(bridge.chapterOrder))
        : chapter.chapterOrder,
    chapterTitle: clampText(bridge.chapterTitle, 80, chapter.chapterTitle),
    promise: clampText(bridge.promise, 180, chapter.promise),
    mainQuestion: clampText(bridge.mainQuestion, 180, chapter.mainQuestion),
    emotionalTone: clampText(bridge.emotionalTone, 120, chapter.emotionalTone),
    minTurns:
      typeof bridge.minTurns === "number" && Number.isFinite(bridge.minTurns)
        ? Math.max(1, Math.trunc(bridge.minTurns))
        : chapter.minTurns,
    targetTurns: normalizeTargetTurns(bridge.targetTurns, chapter.targetTurns),
    softMaxTurns:
      typeof bridge.softMaxTurns === "number" && Number.isFinite(bridge.softMaxTurns)
        ? Math.max(2, Math.trunc(bridge.softMaxTurns))
        : chapter.softMaxTurns,
  };
}

function normalizeChapterDirectorState(
  raw: unknown,
  nowTurn: number,
  bridge?: ChapterBridgeInput
): ChapterDirectorState {
  const base = createInitialChapterDirectorState(nowTurn, bridge ?? {});
  const o = asRecord(raw);
  if (!o) return base;
  const normalized: ChapterDirectorState = {
    ...base,
    v: 1,
    currentChapterId: clampText(o.currentChapterId, 80, base.currentChapterId),
    chapterOrder: clampInt(o.chapterOrder, 1, 999),
    chapterTitle: clampText(o.chapterTitle, 80, base.chapterTitle),
    chapterPhase: normalizeChapterPhase(o.chapterPhase, base.chapterPhase),
    promise: clampText(o.promise, 180, base.promise),
    mainQuestion: clampText(o.mainQuestion, 180, base.mainQuestion),
    emotionalTone: clampText(o.emotionalTone, 120, base.emotionalTone),
    startedTurn: clampInt(o.startedTurn, 0, 999999),
    minTurns: clampInt(o.minTurns, 1, 999),
    targetTurns: normalizeTargetTurns(o.targetTurns, base.targetTurns),
    softMaxTurns: clampInt(o.softMaxTurns, 2, 999),
    openThreadIds: uniqUnknownStrings(o.openThreadIds, 16),
    resolvedThreadIds: uniqUnknownStrings(o.resolvedThreadIds, 16),
    keyChoiceIds: uniqUnknownStrings(o.keyChoiceIds, 16),
    echoedChoiceIds: uniqUnknownStrings(o.echoedChoiceIds, 16),
    mustEchoMemoryIds: uniqUnknownStrings(o.mustEchoMemoryIds, 8),
    forbiddenRevealIds: uniqUnknownStrings(o.forbiddenRevealIds, 12),
    closeCandidate: normalizeCloseDecision(o.closeCandidate),
    nextChapterSeed: normalizeNextChapterSeed(o.nextChapterSeed),
    summaryForPlayer: clampText(o.summaryForPlayer, 420) || null,
    summaryForModel: clampText(o.summaryForModel, 520) || null,
  };
  return applyChapterBridge(normalized, bridge, nowTurn);
}

export function normalizeDirectorState(
  raw: unknown,
  nowTurn: number,
  bridge?: ChapterBridgeInput
): StoryDirectorState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const empty = createEmptyDirectorState(nowTurn);
    return {
      ...empty,
      chapter: normalizeChapterDirectorState(undefined, nowTurn, bridge),
    };
  }
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
    chapter: normalizeChapterDirectorState(o.chapter, nowTurn, bridge),
  };
}

function getMemoryEntryId(entry: MemorySpineEntry): string {
  return clampText(entry.id, 100) || clampText((entry as { mergeKey?: unknown }).mergeKey, 100);
}

function isThreadMemory(entry: MemorySpineEntry): boolean {
  return (
    entry.kind === "promise" ||
    entry.kind === "debt" ||
    entry.kind === "relationship_shift" ||
    entry.kind === "secret_fragment" ||
    entry.kind === "route_hint" ||
    entry.kind === "danger_hint" ||
    entry.kind === "task_residue" ||
    entry.kind === "hook"
  );
}

function collectMemoryThreadIds(entries: MemorySpineEntry[], status: "open" | "resolved", cap: number): string[] {
  const ids: string[] = [];
  for (const entry of entries ?? []) {
    if (!entry || !isThreadMemory(entry)) continue;
    if (status === "open" && entry.status !== "active") continue;
    if (status === "resolved" && entry.status !== "resolved" && entry.status !== "consumed") continue;
    const id = getMemoryEntryId(entry);
    if (id) ids.push(id);
  }
  return uniq(ids, cap);
}

function collectMustEchoMemoryIds(entries: MemorySpineEntry[]): string[] {
  const ranked = (entries ?? [])
    .filter((entry) =>
      entry &&
      entry.status === "active" &&
      (entry.kind === "promise" || entry.kind === "debt" || entry.kind === "hook" || entry.kind === "danger_hint") &&
      Number(entry.salience ?? 0) >= 0.55
    )
    .sort((a, b) => Number(b.salience ?? 0) - Number(a.salience ?? 0))
    .map(getMemoryEntryId)
    .filter(Boolean);
  return uniq(ranked, 6);
}

function collectForbiddenRevealIds(entries: MemorySpineEntry[]): string[] {
  return uniq(
    (entries ?? [])
      .filter((entry) => entry && entry.status === "active" && entry.kind === "secret_fragment")
      .map(getMemoryEntryId)
      .filter(Boolean),
    8
  );
}

function collectResolvedTurnIds(resolvedTurn: any, nowTurn: number, signals: { progressed: boolean }): string[] {
  const ids: string[] = [];
  const fields = [
    "task_updates",
    "new_tasks",
    "relationship_updates",
    "clue_updates",
    "codex_updates",
    "main_threat_updates",
  ];
  for (const field of fields) {
    const rows = Array.isArray(resolvedTurn?.[field]) ? resolvedTurn[field] : [];
    rows.slice(0, 6).forEach((row: unknown, index: number) => {
      const record = asRecord(row);
      const id =
        clampText(record?.id, 80) ||
        clampText(record?.npcId, 80) ||
        clampText(record?.npc_id, 80) ||
        clampText(record?.title, 80);
      ids.push(id ? `${field}:${id}` : `${field}:${nowTurn}:${index}`);
    });
  }
  if (ids.length === 0 && signals.progressed) ids.push(`turn:${nowTurn}:progress`);
  return uniq(ids, 12);
}

function pickNextChapterTitle(order: number): string {
  return `第${toChineseChapterOrder(order + 1)}章`;
}

function buildChapterCloseDecision(input: {
  chapter: ChapterDirectorState;
  signals: ReturnType<typeof detectDirectorSignals>;
  plan: DirectorPlan;
  nowTurn: number;
  openThreadIds: string[];
  resolvedThreadIds: string[];
  keyChoiceIds: string[];
  echoedChoiceIds: string[];
  mustEchoMemoryIds: string[];
  memoryEntries: MemorySpineEntry[];
}): ChapterCloseDecision {
  const chapter: ChapterDirectorState = {
    ...input.chapter,
    openThreadIds: input.openThreadIds,
    resolvedThreadIds: input.resolvedThreadIds,
    keyChoiceIds: input.keyChoiceIds,
    echoedChoiceIds: input.echoedChoiceIds,
    mustEchoMemoryIds: input.mustEchoMemoryIds,
  };
  return evaluateChapterCloseDecision({
    chapter,
    memoryEntries: input.memoryEntries,
    directorPlan: input.plan,
    signals: input.signals,
    nowTurn: input.nowTurn,
  });
}

function buildNextChapterSeed(args: {
  chapter: ChapterDirectorState;
  closeCandidate: ChapterCloseDecision | null;
  openThreadIds: string[];
  mustEchoMemoryIds: string[];
}): NextChapterSeed | null {
  if (!args.closeCandidate?.shouldClose) return null;
  const title = args.closeCandidate.nextChapterTitleCandidate ?? pickNextChapterTitle(args.chapter.chapterOrder);
  return {
    title,
    promise: `承接${args.chapter.chapterTitle}留下的余响，让玩家刚做出的选择在新场景里被回应。`,
    mainQuestion: "新的异常会怎样回应玩家刚刚留下的痕迹？",
    emotionalTone:
      args.chapter.chapterPhase === "aftershock" || args.chapter.chapterPhase === "closing"
        ? "余波未散、短暂停顿后继续逼近"
        : args.chapter.emotionalTone,
    mustEchoMemoryIds: args.mustEchoMemoryIds.slice(0, 6),
    inheritedThreadIds: args.openThreadIds.slice(0, 10),
  };
}

function advanceChapterDirectorState(args: {
  director: StoryDirectorState;
  chapter: ChapterDirectorState;
  signals: ReturnType<typeof detectDirectorSignals>;
  plan: DirectorPlan;
  nowTurn: number;
  postMemoryEntries: MemorySpineEntry[];
  resolvedTurn: any;
}): ReturnType<typeof planChapterStep> {
  const openThreadIds = uniq([
    ...(args.chapter.openThreadIds ?? []),
    ...collectMemoryThreadIds(args.postMemoryEntries, "open", 16),
  ], 16);
  const resolvedThreadIds = uniq([
    ...(args.chapter.resolvedThreadIds ?? []),
    ...collectMemoryThreadIds(args.postMemoryEntries, "resolved", 16),
  ], 16);
  const keyChoiceIds = uniq([
    ...(args.chapter.keyChoiceIds ?? []),
    ...collectResolvedTurnIds(args.resolvedTurn, args.nowTurn, args.signals),
  ], 16);
  const mustEchoMemoryIds = uniq([
    ...collectMustEchoMemoryIds(args.postMemoryEntries),
    ...(args.chapter.mustEchoMemoryIds ?? []),
  ], 8);
  const echoedChoiceIds = uniq([
    ...(args.chapter.echoedChoiceIds ?? []),
    ...(args.plan.beatMode === "reveal" || args.plan.beatMode === "aftershock"
      ? keyChoiceIds.slice(0, 4)
      : []),
  ], 16);
  const forbiddenRevealIds = uniq([
    ...(args.chapter.forbiddenRevealIds ?? []),
    ...collectForbiddenRevealIds(args.postMemoryEntries),
  ], 12);

  const baseCloseCandidate = buildChapterCloseDecision({
    chapter: args.chapter,
    signals: args.signals,
    plan: args.plan,
    nowTurn: args.nowTurn,
    openThreadIds,
    resolvedThreadIds,
    keyChoiceIds,
    echoedChoiceIds,
    mustEchoMemoryIds,
    memoryEntries: args.postMemoryEntries,
  });
  const modelTitleCandidate = sanitizeChapterTitleCandidate(
    (args.resolvedTurn as { next_chapter_title_candidate?: unknown })?.next_chapter_title_candidate,
    32
  );
  const closeCandidate =
    baseCloseCandidate?.shouldClose && modelTitleCandidate
      ? { ...baseCloseCandidate, nextChapterTitleCandidate: modelTitleCandidate }
      : baseCloseCandidate;
  const nextChapterSeed = buildNextChapterSeed({
    chapter: args.chapter,
    closeCandidate,
    openThreadIds,
    mustEchoMemoryIds,
  });

  const chapterWithCandidates: ChapterDirectorState = {
    ...args.chapter,
    openThreadIds,
    resolvedThreadIds,
    keyChoiceIds,
    echoedChoiceIds,
    mustEchoMemoryIds,
    forbiddenRevealIds,
    closeCandidate,
    nextChapterSeed,
    summaryForPlayer: closeCandidate?.shouldClose ? closeCandidate.playerRecapCandidate : args.chapter.summaryForPlayer,
    summaryForModel: closeCandidate?.shouldClose ? closeCandidate.modelSummaryCandidate : args.chapter.summaryForModel,
  };

  return planChapterStep({
    director: { ...args.director, chapter: chapterWithCandidates },
    signals: args.signals,
    memoryEntries: args.postMemoryEntries,
    nowTurn: args.nowTurn,
  });
}

export function postTurnStoryDirectorUpdate(args: {
  directorRaw: unknown;
  incidentQueueRaw: unknown;
  nowTurn: number;
  chapter?: ChapterBridgeInput;
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
  const director0Raw = normalizeDirectorState(args.directorRaw, nowTurn);
  const director0: StoryDirectorState = {
    ...director0Raw,
    chapter: applyChapterBridge(director0Raw.chapter, args.chapter, nowTurn),
  };
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
    recentProgressTurns: progressed ? uniq([String(nowTurn), ...(director0.recentProgressTurns ?? []).map(String)], 8).map((x) => Number(x)) : director0.recentProgressTurns,
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
  const chapterStep = advanceChapterDirectorState({
    director: director1,
    chapter: director1.chapter,
    signals,
    plan,
    nowTurn,
    postMemoryEntries: args.post.memoryEntries,
    resolvedTurn: args.resolvedTurn,
  });
  const chapter = chapterStep.chapter;
  recordChapterReasonerTrace({
    turn: nowTurn,
    chapterId: chapter.currentChapterId,
    phaseBefore: director1.chapter.chapterPhase,
    phaseAfter: chapter.chapterPhase,
    closeDecision: chapter.closeCandidate,
    mustEchoMemoryIds: chapterStep.mustEchoMemoryIds,
    selectedThreadIds: uniq([...(chapter.openThreadIds ?? []), ...(chapter.resolvedThreadIds ?? [])], 16),
    nextChapterSeed: chapter.nextChapterSeed,
    reason:
      chapter.closeCandidate?.reason ??
      `phase:${director1.chapter.chapterPhase}->${chapter.chapterPhase};prepare_close=${chapterStep.shouldPrepareClose ? "1" : "0"}`,
    suppressedGameyUi: true,
  });

  const director2: StoryDirectorState = {
    ...director1,
    chapter,
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


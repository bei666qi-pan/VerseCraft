// src/lib/turnEngine/enqueueBackgroundTick.ts
/**
 * Phase-4: non-blocking background world-tick scheduler.
 *
 * Wraps `detectWorldEngineTriggers` + `enqueueWorldEngineTick` so the online
 * main loop can delegate world-engine scheduling without ever awaiting the
 * queue RTT on the hot path.
 *
 * Two halves:
 *
 *   1. `decideBackgroundTick` — pure, synchronous. Given the turn context it
 *      decides whether a tick should be enqueued and returns the trigger list.
 *      Fully unit-testable.
 *
 *   2. `scheduleBackgroundWorldTick` — returns synchronously with the decision
 *      *and* a detached `pending` promise. Callers MUST NOT `await` it; they
 *      may attach `.catch(() => {})` or rely on the wrapper's internal swallow.
 *      An optional `onSettled` hook lets the caller emit analytics after the
 *      enqueue completes, still outside the hot path.
 *
 * The wrapper exists so `route.ts` does not need to duplicate the "detect ->
 * guard -> enqueue -> swallow" pattern at every callsite.
 */
import type {
  WorldEngineTickPayload,
  WorldEngineTrigger,
} from "@/lib/worldEngine/contracts";
import { detectWorldEngineTriggers } from "@/lib/worldEngine/contracts";
import { validatePacingChapterSignals } from "@/lib/worldEngine/contracts";
import type { TurnCommitSummary } from "@/lib/turnEngine/commitTurn";
import {
  type MapId,
  type WorldId,
} from "@/lib/worlds/types";

export type BackgroundTickDecision = {
  shouldEnqueue: boolean;
  triggers: readonly WorldEngineTrigger[];
  /** Reason code when `shouldEnqueue === false`. */
  skipReason?: "no_session_id" | "no_dm_record" | "no_triggers";
};

export type DecideBackgroundTickArgs = {
  sessionId: string | null;
  turnIndex: number;
  latestUserInput: string;
  dmRecord: Record<string, unknown> | null;
  playerLocation: string | null;
  previousPlayerLocation?: string | null;
  npcLocationUpdateCount: number;
  preflightRiskTags: readonly string[];
  minTriggerGapTurns?: number;
  maxPendingAgenda?: number;
  pendingAgendaCount?: number;
  lastWorldEngineTurn?: number | null;
  progresslessTurnCount?: number;
  repeatedInvestigationCount?: number;
  dueHookCount?: number;
  dueNpcAgendaCount?: number;
  clueCount?: number;
  keyClueRank?: number;
  currentTension?: number | null;
  recentHighPressureTurns?: number;
};

export function decideBackgroundTick(
  args: DecideBackgroundTickArgs
): BackgroundTickDecision {
  if (!args.sessionId) {
    return { shouldEnqueue: false, triggers: [], skipReason: "no_session_id" };
  }
  if (!args.dmRecord) {
    return { shouldEnqueue: false, triggers: [], skipReason: "no_dm_record" };
  }
  const triggers = detectWorldEngineTriggers({
    turnIndex: args.turnIndex,
    latestUserInput: args.latestUserInput,
    playerLocation: args.playerLocation,
    previousPlayerLocation: args.previousPlayerLocation,
    npcLocationUpdateCount: args.npcLocationUpdateCount,
    dmRecord: args.dmRecord,
    preflightRiskTags: [...args.preflightRiskTags],
    minTriggerGapTurns: args.minTriggerGapTurns,
    maxPendingAgenda: args.maxPendingAgenda,
    pendingAgendaCount: args.pendingAgendaCount,
    lastWorldEngineTurn: args.lastWorldEngineTurn,
    progresslessTurnCount: args.progresslessTurnCount,
    repeatedInvestigationCount: args.repeatedInvestigationCount,
    dueHookCount: args.dueHookCount,
    dueNpcAgendaCount: args.dueNpcAgendaCount,
    clueCount: args.clueCount,
    keyClueRank: args.keyClueRank,
    currentTension: args.currentTension,
    recentHighPressureTurns: args.recentHighPressureTurns,
  });
  if (triggers.length === 0) {
    return { shouldEnqueue: false, triggers: [], skipReason: "no_triggers" };
  }
  return { shouldEnqueue: true, triggers };
}

export type EnqueueWorldEngineTickFn = (
  payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">
) => Promise<{ enqueued: boolean; jobId?: number | null; dedupKey: string }>;

export type BackgroundTickEnqueueResult = {
  enqueued: boolean;
  jobId: number | null;
  dedupKey: string | null;
  error?: Error;
};

export type ScheduleBackgroundWorldTickArgs = DecideBackgroundTickArgs & {
  requestId: string;
  userId: string | null;
  worldId: WorldId;
  mapId: MapId;
  dmNarrativePreview: string;
  pacingControllerDigest?: {
    tension?: number;
    beatModeHint?: string;
    pressureFlags?: readonly string[];
    mustRecallHookCodes?: readonly string[];
    chapterId?: string | null;
    completedBeatIds?: readonly string[];
    turnsInChapter?: number;
  } | null;
  /**
   * Injected enqueue function. In production this is `enqueueWorldEngineTick`
   * from `@/lib/worldEngine/queue`; tests pass a stub.
   */
  enqueueFn: EnqueueWorldEngineTickFn;
  /**
   * Optional commit summary captured at the same instant; passed through to
   * the `onSettled` hook so analytics can correlate commit + enqueue.
   */
  commitSummary?: TurnCommitSummary | null;
  /**
   * Optional post-settle hook. Runs *outside* the online hot path; errors are
   * swallowed — this hook is for telemetry only.
   */
  onSettled?: (info: {
    decision: BackgroundTickDecision;
    result: BackgroundTickEnqueueResult;
    commitSummary: TurnCommitSummary | null;
  }) => void | Promise<void>;
};

export type ScheduleBackgroundWorldTickResult = {
  decision: BackgroundTickDecision;
  /** Resolves once the detached enqueue + optional onSettled have completed. */
  pending: Promise<BackgroundTickEnqueueResult>;
};

function extractChangedIds(record: Record<string, unknown> | null, keys: readonly string[]): string[] {
  if (!record) return [];
  const out = new Set<string>();
  for (const key of keys) {
    const values = record[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const id = typeof value === "string"
        ? value
        : value && typeof value === "object" && !Array.isArray(value)
          ? String((value as Record<string, unknown>).id ?? (value as Record<string, unknown>).task_id ?? (value as Record<string, unknown>).clue_id ?? "")
          : "";
      const normalized = id.trim().slice(0, 128);
      if (normalized) out.add(normalized);
      if (out.size >= 64) return [...out];
    }
  }
  return [...out];
}

function classifyActionKinds(
  raw: string,
  after: string | null,
  before?: string | null,
): Array<"exploration" | "dialogue" | "confrontation" | "movement" | "other"> {
  const input = raw.toLowerCase();
  const kinds = new Set<"exploration" | "dialogue" | "confrontation" | "movement" | "other">();
  if (/看|观察|检查|调查|search|inspect|look/.test(input)) kinds.add("exploration");
  if (/问|说|喊|对话|告诉|ask|talk|say/.test(input)) kinds.add("dialogue");
  if (/打|砸|冲|逃|躲|fight|attack|run|hide/.test(input)) kinds.add("confrontation");
  if (before && after && before !== after) kinds.add("movement");
  if (kinds.size === 0) kinds.add("other");
  return [...kinds];
}

/**
 * Schedule a world-engine tick without blocking the online path.
 *
 * IMPORTANT: callers should NOT await `pending`. The return value is mainly
 * for tests; production code usually does:
 *
 *     const { pending } = scheduleBackgroundWorldTick({ ... });
 *     void pending;
 */
export function scheduleBackgroundWorldTick(
  args: ScheduleBackgroundWorldTickArgs
): ScheduleBackgroundWorldTickResult {
  const decision = decideBackgroundTick({
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    latestUserInput: args.latestUserInput,
    dmRecord: args.dmRecord,
    playerLocation: args.playerLocation,
    previousPlayerLocation: args.previousPlayerLocation,
    npcLocationUpdateCount: args.npcLocationUpdateCount,
    preflightRiskTags: args.preflightRiskTags,
    minTriggerGapTurns: args.minTriggerGapTurns,
    maxPendingAgenda: args.maxPendingAgenda,
    pendingAgendaCount: args.pendingAgendaCount,
    lastWorldEngineTurn: args.lastWorldEngineTurn,
    progresslessTurnCount: args.progresslessTurnCount,
    repeatedInvestigationCount: args.repeatedInvestigationCount,
    dueHookCount: args.dueHookCount,
    dueNpcAgendaCount: args.dueNpcAgendaCount,
    clueCount: args.clueCount,
    keyClueRank: args.keyClueRank,
    currentTension: args.currentTension,
    recentHighPressureTurns: args.recentHighPressureTurns,
  });

  if (!decision.shouldEnqueue || !args.sessionId) {
    const skipResult: BackgroundTickEnqueueResult = { enqueued: false, jobId: null, dedupKey: null };
    const pending = Promise.resolve().then(async () => {
      try {
        await args.onSettled?.({
          decision,
          result: skipResult,
          commitSummary: args.commitSummary ?? null,
        });
      } catch {
        /* telemetry swallow */
      }
      return skipResult;
    });
    return { decision, pending };
  }

  const sessionId = args.sessionId;
  const triggers = decision.triggers;
  const phaseByBeat: Record<string, WorldEngineTickPayload["pacingChapterSignals"]["phase"]> = {
    quiet: "opening",
    pressure: "turning",
    reveal: "climax",
    collision: "turning",
    countdown: "rising",
    peak: "climax",
    aftershock: "resolution",
  };
  const digest = args.pacingControllerDigest;
  const pacingChapterSignals = validatePacingChapterSignals({
    phase: phaseByBeat[String(digest?.beatModeHint ?? "")] ?? "opening",
    tension: digest && typeof digest.tension === "number"
      ? Math.round(Math.max(0, Math.min(100, digest.tension)) / 20)
      : Math.round(Math.max(0, Math.min(1, args.currentTension ?? 0.3)) * 5),
    chapterId: digest?.chapterId ?? (typeof args.dmRecord?.chapter_id === "string" ? args.dmRecord.chapter_id : "chapter-unknown"),
    completedBeatIds: digest?.completedBeatIds ?? [],
    turnsInChapter: digest?.turnsInChapter ?? args.turnIndex,
  });
  const pacingStateCodes = [...new Set([
    ...(digest?.pressureFlags ?? []),
    ...(digest?.mustRecallHookCodes ?? []),
  ].map((value) => String(value).trim().slice(0, 128)).filter(Boolean))].slice(0, 32);

  const pending = Promise.resolve().then(async (): Promise<BackgroundTickEnqueueResult> => {
    let enqResult: BackgroundTickEnqueueResult;
    try {
      const r = await args.enqueueFn({
        version: 2,
        requestId: args.requestId,
        userId: args.userId,
        sessionId,
        worldId: args.worldId,
        mapId: args.mapId,
        triggerSignals: [...triggers],
        controlRiskTags: [...args.preflightRiskTags],
        playerLocationBefore: args.previousPlayerLocation ?? null,
        playerLocationAfter: args.playerLocation,
        presentNpcIds: Array.isArray(args.dmRecord?.present_npc_ids)
          ? args.dmRecord.present_npc_ids.filter((id): id is string => typeof id === "string").slice(0, 64)
          : [],
        deadNpcIds: Array.isArray(args.dmRecord?.dead_npc_ids)
          ? args.dmRecord.dead_npc_ids.filter((id): id is string => typeof id === "string").slice(0, 64)
          : [],
        changedTaskIds: extractChangedIds(args.dmRecord, ["task_updates", "new_tasks"]),
        changedClueIds: extractChangedIds(args.dmRecord, ["clue_updates", "codex_updates"]),
        pacingChapterSignals,
        worldStateSummary: {
          day: Math.max(0, Math.floor(args.turnIndex / 12)),
          timeSlot: "unknown",
          danger: args.preflightRiskTags.length > 0 ? "medium" : "low",
          stateCodes: pacingStateCodes,
        },
        latestTurnSignals: {
          actionKinds: classifyActionKinds(args.latestUserInput, args.playerLocation, args.previousPlayerLocation),
          legal: args.dmRecord?.is_action_legal !== false,
          death: args.dmRecord?.is_death === true,
          riskTags: [...args.preflightRiskTags].slice(0, 16),
        },
        npcLocationUpdateCount: args.npcLocationUpdateCount,
        turnIndex: args.turnIndex,
      });
      enqResult = { enqueued: r.enqueued, jobId: r.jobId ?? null, dedupKey: r.dedupKey };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      enqResult = { enqueued: false, jobId: null, dedupKey: null, error: err };
    }
    try {
      await args.onSettled?.({
        decision,
        result: enqResult,
        commitSummary: args.commitSummary ?? null,
      });
    } catch {
      /* telemetry swallow */
    }
    return enqResult;
  });

  // Detach errors so un-awaited callers never see UnhandledPromiseRejection.
  pending.catch(() => {});

  return { decision, pending };
}

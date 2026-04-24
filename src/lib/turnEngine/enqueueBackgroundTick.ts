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
import type { TurnCommitSummary } from "@/lib/turnEngine/commitTurn";

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
  npcLocationUpdateCount: number;
  preflightRiskTags: readonly string[];
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
    npcLocationUpdateCount: args.npcLocationUpdateCount,
    dmRecord: args.dmRecord,
    preflightRiskTags: [...args.preflightRiskTags],
  });
  if (triggers.length === 0) {
    return { shouldEnqueue: false, triggers: [], skipReason: "no_triggers" };
  }
  return { shouldEnqueue: true, triggers };
}

export type EnqueueWorldEngineTickFn = (
  payload: Omit<WorldEngineTickPayload, "dedupKey" | "enqueuedAt">
) => Promise<{ enqueued: boolean; dedupKey: string }>;

export type BackgroundTickEnqueueResult = {
  enqueued: boolean;
  dedupKey: string | null;
  error?: Error;
};

export type ScheduleBackgroundWorldTickArgs = DecideBackgroundTickArgs & {
  requestId: string;
  userId: string | null;
  dmNarrativePreview: string;
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
    npcLocationUpdateCount: args.npcLocationUpdateCount,
    preflightRiskTags: args.preflightRiskTags,
  });

  if (!decision.shouldEnqueue || !args.sessionId) {
    const skipResult: BackgroundTickEnqueueResult = { enqueued: false, dedupKey: null };
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

  const pending = Promise.resolve().then(async (): Promise<BackgroundTickEnqueueResult> => {
    let enqResult: BackgroundTickEnqueueResult;
    try {
      const r = await args.enqueueFn({
        requestId: args.requestId,
        userId: args.userId,
        sessionId,
        latestUserInput: args.latestUserInput,
        triggerSignals: [...triggers],
        controlRiskTags: [...args.preflightRiskTags],
        dmNarrativePreview: args.dmNarrativePreview.slice(0, 1200),
        playerLocation: args.playerLocation,
        npcLocationUpdateCount: args.npcLocationUpdateCount,
        turnIndex: args.turnIndex,
      });
      enqResult = { enqueued: r.enqueued, dedupKey: r.dedupKey };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      enqResult = { enqueued: false, dedupKey: null, error: err };
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

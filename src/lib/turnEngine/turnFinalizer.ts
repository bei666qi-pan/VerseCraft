import {
  commitTurn,
  type CommitTurnArgs,
  type CommitTurnResult,
} from "./commitTurn";
import type { CommittedTurnReceipt, TurnLane } from "./contracts";
import type { MapId } from "@/lib/worlds/types";

export type TurnFinalizationInput = CommitTurnArgs & {
  worldId: NonNullable<CommitTurnArgs["worldId"]>;
  mapId: MapId;
  sessionId: string;
  lane: TurnLane;
};

export interface TurnFinalizationResult extends CommitTurnResult {
  receipt: CommittedTurnReceipt;
}

export type PreparedTurnCommit = TurnFinalizationResult;

export interface TurnFinalizer {
  prepare(input: TurnFinalizationInput): PreparedTurnCommit;
  publish(
    prepared: PreparedTurnCommit,
    finalRecord?: Record<string, unknown>,
  ): Promise<TurnFinalizationResult>;
  finalize(input: TurnFinalizationInput): Promise<TurnFinalizationResult>;
}

export function createTurnFinalizer(deps: {
  commit?: (input: CommitTurnArgs) => CommitTurnResult;
  emitFinal: (record: Record<string, unknown>) => Promise<void>;
  enqueueDirector: (
    receipt: CommittedTurnReceipt,
    record: Record<string, unknown>,
    summary: CommitTurnResult["summary"],
  ) => void | Promise<void>;
  onBackgroundError?: (error: unknown) => void;
  now?: () => Date;
}): TurnFinalizer {
  const preparedByReceipt = new Map<string, PreparedTurnCommit>();
  const publishedByReceipt = new Map<string, Promise<TurnFinalizationResult>>();
  const commit = deps.commit ?? commitTurn;
  const now = deps.now ?? (() => new Date());

  function prepare(input: TurnFinalizationInput): PreparedTurnCommit {
    const receiptId = [input.worldId, input.mapId, input.sessionId, input.turnIndex].join(":");
    const existing = preparedByReceipt.get(receiptId);
    if (existing) return existing;

    const committed = commit(input);
    const prepared: PreparedTurnCommit = {
      ...committed,
      receipt: {
        id: receiptId,
        requestId: input.requestId,
        worldId: input.worldId,
        mapId: input.mapId,
        sessionId: input.sessionId,
        turnIndex: input.turnIndex,
        committedAt: now().toISOString(),
        lane: input.lane,
      },
    };
    preparedByReceipt.set(receiptId, prepared);
    return prepared;
  }

  function publish(
    prepared: PreparedTurnCommit,
    finalRecord = prepared.committedDmRecord,
  ): Promise<TurnFinalizationResult> {
    const receiptId = prepared.receipt.id;
    const existing = publishedByReceipt.get(receiptId);
    if (existing) return existing;

    const published = (async (): Promise<TurnFinalizationResult> => {
      await deps.emitFinal(finalRecord);
      const result = { ...prepared, committedDmRecord: finalRecord };
      // Director work starts only after FINAL and is intentionally off the online latency path.
      void Promise.resolve(
        deps.enqueueDirector(prepared.receipt, finalRecord, prepared.summary),
      ).catch((error) => deps.onBackgroundError?.(error));
      return result;
    })();

    publishedByReceipt.set(receiptId, published);
    return published;
  }

  return {
    prepare,
    publish,
    async finalize(input) {
      return publish(prepare(input));
    },
  };
}

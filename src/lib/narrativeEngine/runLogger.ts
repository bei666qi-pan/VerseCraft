import type { NarrativeRunSummary } from "./types";
import {
  writeNarrativeRunBestEffort,
  type NarrativeRunRepositoryDeps,
} from "./narrativeRunRepository";

export type NarrativeRunLogArgs = {
  requestId: string;
  sessionId: string | null;
  userId: string | null;
  turnIndex: number;
  ttftMs?: number;
  totalLatencyMs?: number;
  loreHitCount?: number;
  validatorIssueCount?: number;
  degradeReason?: string | null;
  commitFlags?: string[];
  meta?: Record<string, unknown>;
  deps?: NarrativeRunRepositoryDeps;
};

export async function logNarrativeRun(args: NarrativeRunLogArgs): Promise<void> {
  try {
    await writeNarrativeRunBestEffort(
      {
        requestId: args.requestId,
        sessionId: args.sessionId,
        userId: args.userId,
        turnIndex: args.turnIndex,
        ttftMs: args.ttftMs,
        totalLatencyMs: args.totalLatencyMs,
        loreHitCount: args.loreHitCount,
        validatorIssueCount: args.validatorIssueCount,
        degradeReason: args.degradeReason ?? null,
        commitFlags: args.commitFlags ?? [],
        meta: buildNarrativeRunMeta(args.meta),
      },
      args.deps
    );
  } catch {
    // Run observability is best-effort and must never affect player turns.
  }
}

export function buildNarrativeRunSummaryPayload(summary: NarrativeRunSummary): Record<string, unknown> {
  return {
    requestId: summary.requestId,
    sessionId: summary.sessionId,
    userId: summary.userId,
    messageCount: summary.messageCount,
    latestUserInputChars: summary.latestUserInputChars,
    playerContextChars: summary.playerContextChars,
    clientPurpose: summary.clientPurpose,
    phase: summary.phase,
    handledBy: summary.handledBy,
  };
}

export function buildNarrativeRunMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const input = meta ?? {};
  return {
    providerRole: input.providerRole ?? nested(input.provider, "role") ?? null,
    routeLane: input.routeLane ?? input.lane ?? null,
    contextBuildDegrade: input.contextBuildDegrade ?? nested(input.dialogueContext, "degraded") ?? null,
    checkerIssues: input.checkerIssues ?? nested(input.modelOutputCheck, "issues") ?? [],
    loreRetrieval: input.loreRetrieval ?? {
      usedCounts: input.loreRetrievalUsedCounts ?? input.retrievalSourceCounts ?? {},
      hitCount: input.loreHitCount ?? null,
    },
    modelParseFallback: input.modelParseFallback ?? null,
    commitResult: input.commitResult ?? {
      committed: input.committed ?? null,
      commitFlags: input.commitFlags ?? [],
    },
    ...input,
  };
}

function nested(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

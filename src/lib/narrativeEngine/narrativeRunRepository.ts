import { narrativeRuns } from "@/db/schema";

export type NarrativeRunInsertRow = typeof narrativeRuns.$inferInsert;

export type NarrativeRunWriteInput = {
  requestId: string;
  sessionId?: string | null;
  userId?: string | null;
  turnIndex?: number;
  ttftMs?: number | null;
  totalLatencyMs?: number | null;
  loreHitCount?: number;
  validatorIssueCount?: number;
  degradeReason?: string | null;
  commitFlags?: string[];
  meta?: Record<string, unknown>;
  createdAt?: Date;
};

export type NarrativeRunWriteResult =
  | { ok: true }
  | { ok: false; reason: string };

export type NarrativeRunRepositoryDeps = {
  upsert?: (row: NarrativeRunInsertRow) => Promise<unknown>;
  warn?: (reason: string, error: unknown) => void;
};

export function buildNarrativeRunInsertRow(input: NarrativeRunWriteInput): NarrativeRunInsertRow {
  const row: NarrativeRunInsertRow = {
    requestId: input.requestId,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    turnIndex: intOrDefault(input.turnIndex, 0),
    ttftMs: optionalInt(input.ttftMs),
    totalLatencyMs: optionalInt(input.totalLatencyMs),
    loreHitCount: intOrDefault(input.loreHitCount, 0),
    validatorIssueCount: intOrDefault(input.validatorIssueCount, 0),
    degradeReason: input.degradeReason ?? null,
    commitFlags: input.commitFlags ?? [],
    meta: input.meta ?? {},
  };
  if (input.createdAt) row.createdAt = input.createdAt;
  return row;
}

export async function writeNarrativeRunBestEffort(
  input: NarrativeRunWriteInput,
  deps: NarrativeRunRepositoryDeps = {}
): Promise<NarrativeRunWriteResult> {
  const row = buildNarrativeRunInsertRow(input);
  try {
    await (deps.upsert ?? upsertNarrativeRunRow)(row);
    return { ok: true };
  } catch (error) {
    const reason = errorReason(error);
    (deps.warn ?? defaultWarn)(reason, error);
    return { ok: false, reason };
  }
}

async function upsertNarrativeRunRow(row: NarrativeRunInsertRow): Promise<void> {
  const { db } = await import("@/db");
  await db
    .insert(narrativeRuns)
    .values(row)
    .onConflictDoUpdate({
      target: narrativeRuns.requestId,
      set: {
        sessionId: row.sessionId,
        userId: row.userId,
        turnIndex: row.turnIndex,
        ttftMs: row.ttftMs,
        totalLatencyMs: row.totalLatencyMs,
        loreHitCount: row.loreHitCount,
        validatorIssueCount: row.validatorIssueCount,
        degradeReason: row.degradeReason,
        commitFlags: row.commitFlags,
        meta: row.meta,
      },
    });
}

function optionalInt(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function intOrDefault(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.trunc(value);
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function defaultWarn(reason: string, error: unknown): void {
  console.warn(`[narrativeEngine][narrativeRunRepository] write failed: ${reason}`, error);
}

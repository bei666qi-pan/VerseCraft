import { storyEvents } from "@/db/schema";

export type StoryEventInsertRow = typeof storyEvents.$inferInsert;

export type StoryEventWriteInput = {
  requestId: string;
  sessionId?: string | null;
  userId?: string | null;
  turnIndex?: number;
  worldId?: string;
  chapterId?: string | null;
  sceneId?: string | null;
  actorType: string;
  actorId?: string | null;
  eventType: string;
  summary: string;
  payload?: Record<string, unknown>;
  committed?: boolean;
  createdAt?: Date;
};

export type StoryEventWriteResult =
  | { ok: true; id?: number | string }
  | { ok: false; reason: string };

export type RecentStoryEventRecord = {
  id: string | number;
  turnIndex: number;
  actorType: string;
  actorId: string | null;
  eventType: string;
  summary: string;
};

export type StoryEventReadInput = {
  sessionId?: string | null;
  userId?: string | null;
  limit?: number;
};

export type StoryEventReadResult =
  | { ok: true; events: RecentStoryEventRecord[] }
  | { ok: false; events: []; reason: string };

export type StoryEventRepositoryDeps = {
  insert?: (row: StoryEventInsertRow) => Promise<unknown>;
  readRecent?: (input: Required<StoryEventReadInput>) => Promise<RecentStoryEventRecord[]>;
  warn?: (reason: string, error: unknown) => void;
};

export function buildStoryEventInsertRow(input: StoryEventWriteInput): StoryEventInsertRow {
  const row: StoryEventInsertRow = {
    requestId: input.requestId,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    turnIndex: Math.trunc(input.turnIndex ?? 0),
    worldId: input.worldId ?? "base_apartment",
    chapterId: input.chapterId ?? null,
    sceneId: input.sceneId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    eventType: input.eventType,
    summary: input.summary,
    payload: input.payload ?? {},
    committed: input.committed ?? false,
  };
  if (input.createdAt) row.createdAt = input.createdAt;
  return row;
}

export async function writeStoryEventBestEffort(
  input: StoryEventWriteInput,
  deps: StoryEventRepositoryDeps = {}
): Promise<StoryEventWriteResult> {
  const row = buildStoryEventInsertRow(input);
  try {
    const written = await (deps.insert ?? insertStoryEventRow)(row);
    const id = extractWrittenId(written);
    return id === undefined ? { ok: true } : { ok: true, id };
  } catch (error) {
    const reason = errorReason(error);
    (deps.warn ?? defaultWarn)(reason, error);
    return { ok: false, reason };
  }
}

export async function readRecentStoryEventsBestEffort(
  input: StoryEventReadInput,
  deps: StoryEventRepositoryDeps = {}
): Promise<StoryEventReadResult> {
  const normalized = normalizeReadInput(input);
  if (!normalized.sessionId && !normalized.userId) {
    return { ok: true, events: [] };
  }
  try {
    const events = await (deps.readRecent ?? selectRecentStoryEvents)(normalized);
    return { ok: true, events };
  } catch (error) {
    const reason = errorReason(error);
    (deps.warn ?? defaultWarn)(reason, error);
    return { ok: false, events: [], reason };
  }
}

async function insertStoryEventRow(row: StoryEventInsertRow): Promise<number | string | undefined> {
  const { db } = await import("@/db");
  const inserted = await db.insert(storyEvents).values(row).returning({ id: storyEvents.id });
  return inserted[0]?.id;
}

async function selectRecentStoryEvents(input: Required<StoryEventReadInput>): Promise<RecentStoryEventRecord[]> {
  const { pool } = await import("@/db");
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (input.sessionId) {
    params.push(input.sessionId);
    clauses.push(`session_id = $${params.length}`);
  }
  if (input.userId) {
    params.push(input.userId);
    clauses.push(`user_id = $${params.length}`);
  }
  if (clauses.length === 0) return [];
  params.push(input.limit);

  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string | number;
      turn_index: number;
      actor_type: string;
      actor_id: string | null;
      event_type: string;
      summary: string;
    }>(
      `
        SELECT id, turn_index, actor_type, actor_id, event_type, summary
        FROM story_events
        WHERE ${clauses.map((clause) => `(${clause})`).join(" OR ")}
        ORDER BY turn_index DESC, id DESC
        LIMIT $${params.length}
      `,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      turnIndex: Number(row.turn_index) || 0,
      actorType: row.actor_type,
      actorId: row.actor_id,
      eventType: row.event_type,
      summary: row.summary,
    }));
  } finally {
    client.release();
  }
}

function normalizeReadInput(input: StoryEventReadInput): Required<StoryEventReadInput> {
  return {
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    limit: Math.max(0, Math.min(24, Math.trunc(input.limit ?? 12))),
  };
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function extractWrittenId(value: unknown): number | string | undefined {
  if (typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return extractWrittenId(value[0]);
  if (!value || typeof value !== "object") return undefined;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "number" || typeof id === "string" ? id : undefined;
}

function defaultWarn(reason: string, error: unknown): void {
  console.warn(`[narrativeEngine][storyEventRepository] operation failed: ${reason}`, error);
}

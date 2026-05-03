import { npcMemoryEntries } from "@/db/schema";

export type NpcMemoryInsertRow = typeof npcMemoryEntries.$inferInsert;

export type NpcMemoryWriteInput = {
  npcId: string;
  sessionId?: string | null;
  userId?: string | null;
  scope: string;
  kind: string;
  summary: string;
  factIds?: string[];
  relatedEventIds?: Array<number | string>;
  salience?: number;
  confidence?: number;
  emotion?: Record<string, unknown>;
  expiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type NpcMemoryWriteResult =
  | { ok: true; id?: number | string }
  | { ok: false; reason: string };

export type NpcMemoryContextRecord = {
  id: string | number;
  npcId: string;
  scope: string;
  kind: string;
  summary: string;
  salience: number;
  confidence: number;
  emotion?: Record<string, unknown>;
};

export type NpcMemoryReadInput = {
  npcId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  limit?: number;
};

export type NpcMemoryReadResult =
  | { ok: true; memories: NpcMemoryContextRecord[] }
  | { ok: false; memories: []; reason: string };

export type NpcMemoryRepositoryDeps = {
  insert?: (row: NpcMemoryInsertRow) => Promise<unknown>;
  readRecent?: (input: Required<NpcMemoryReadInput>) => Promise<NpcMemoryContextRecord[]>;
  warn?: (reason: string, error: unknown) => void;
};

export function buildNpcMemoryInsertRow(input: NpcMemoryWriteInput): NpcMemoryInsertRow {
  const row: NpcMemoryInsertRow = {
    npcId: input.npcId,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    scope: input.scope,
    kind: input.kind,
    summary: input.summary,
    factIds: input.factIds ?? [],
    relatedEventIds: input.relatedEventIds ?? [],
    salience: intOrDefault(input.salience, 50),
    confidence: intOrDefault(input.confidence, 80),
    emotion: input.emotion ?? {},
    expiresAt: input.expiresAt ?? null,
  };
  if (input.createdAt) row.createdAt = input.createdAt;
  if (input.updatedAt) row.updatedAt = input.updatedAt;
  return row;
}

export async function writeNpcMemoryBestEffort(
  input: NpcMemoryWriteInput,
  deps: NpcMemoryRepositoryDeps = {}
): Promise<NpcMemoryWriteResult> {
  const row = buildNpcMemoryInsertRow(input);
  try {
    const written = await (deps.insert ?? insertNpcMemoryRow)(row);
    const id = extractWrittenId(written);
    return id === undefined ? { ok: true } : { ok: true, id };
  } catch (error) {
    const reason = errorReason(error);
    (deps.warn ?? defaultWarn)(reason, error);
    return { ok: false, reason };
  }
}

export async function readRecentNpcMemoriesBestEffort(
  input: NpcMemoryReadInput,
  deps: NpcMemoryRepositoryDeps = {}
): Promise<NpcMemoryReadResult> {
  const normalized = normalizeReadInput(input);
  if (!normalized.npcId) {
    return { ok: true, memories: [] };
  }
  try {
    const memories = await (deps.readRecent ?? selectRecentNpcMemories)(normalized);
    return { ok: true, memories };
  } catch (error) {
    const reason = errorReason(error);
    (deps.warn ?? defaultWarn)(reason, error);
    return { ok: false, memories: [], reason };
  }
}

async function insertNpcMemoryRow(row: NpcMemoryInsertRow): Promise<number | string | undefined> {
  const { db } = await import("@/db");
  const inserted = await db.insert(npcMemoryEntries).values(row).returning({ id: npcMemoryEntries.id });
  return inserted[0]?.id;
}

async function selectRecentNpcMemories(input: Required<NpcMemoryReadInput>): Promise<NpcMemoryContextRecord[]> {
  if (!input.npcId) return [];
  const { pool } = await import("@/db");
  const clauses = ["npc_id = $1"];
  const params: unknown[] = [input.npcId];
  if (input.sessionId) {
    params.push(input.sessionId);
    clauses.push(`session_id = $${params.length}`);
  }
  if (input.userId) {
    params.push(input.userId);
    clauses.push(`user_id = $${params.length}`);
  }
  params.push(input.limit);

  const client = await pool.connect();
  try {
    const result = await client.query<{
      id: string | number;
      npc_id: string;
      scope: string;
      kind: string;
      summary: string;
      salience: number;
      confidence: number;
      emotion: Record<string, unknown> | null;
    }>(
      `
        SELECT id, npc_id, scope, kind, summary, salience, confidence, emotion
        FROM npc_memory_entries
        WHERE ${clauses.map((clause) => `(${clause})`).join(" AND ")}
        ORDER BY salience DESC, updated_at DESC, id DESC
        LIMIT $${params.length}
      `,
      params
    );
    return result.rows.map((row) => ({
      id: row.id,
      npcId: row.npc_id,
      scope: row.scope,
      kind: row.kind,
      summary: row.summary,
      salience: Number(row.salience) || 0,
      confidence: Number(row.confidence) || 0,
      ...(row.emotion && typeof row.emotion === "object" ? { emotion: row.emotion } : {}),
    }));
  } finally {
    client.release();
  }
}

function intOrDefault(value: number | null | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.trunc(value);
}

function normalizeReadInput(input: NpcMemoryReadInput): Required<NpcMemoryReadInput> {
  return {
    npcId: input.npcId ?? null,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    limit: Math.max(0, Math.min(24, Math.trunc(input.limit ?? 8))),
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
  console.warn(`[narrativeEngine][npcMemoryRepository] operation failed: ${reason}`, error);
}

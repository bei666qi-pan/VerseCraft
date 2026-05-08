import { eq, sql } from "drizzle-orm";

import { playerEchoCanon, playerEchoEvents } from "@/db/schema";
import { normalizePlayerEchoCanon } from "./reducer";
import type { EchoFragment, NpcEchoBond, PlayerEchoCanon } from "./types";

type UnknownRecord = Record<string, unknown>;

export type PlayerEchoCanonDbRow = {
  userId?: string | null;
  user_id?: string | null;
  totalRuns?: number | null;
  total_runs?: number | null;
  totalDeaths?: number | null;
  total_deaths?: number | null;
  endingsSeen?: unknown;
  endings_seen?: unknown;
  highestFloorScore?: number | null;
  highest_floor_score?: number | null;
  repeatedDeathCauses?: unknown;
  repeated_death_causes?: unknown;
  recurringNpcBonds?: unknown;
  recurring_npc_bonds?: unknown;
  unresolvedRegrets?: unknown;
  unresolved_regrets?: unknown;
  strongestChoices?: unknown;
  strongest_choices?: unknown;
  stableEchoSummary?: string | null;
  stable_echo_summary?: string | null;
  lastRunSummary?: string | null;
  last_run_summary?: string | null;
  echoIntensity?: number | null;
  echo_intensity?: number | null;
  updatedAt?: Date | string | null;
  updated_at?: Date | string | null;
};

type SelectLimit<Row> = {
  limit(limit: number): Promise<Row[]>;
};

type SelectWhere<Row> = {
  where(condition: unknown): SelectLimit<Row>;
};

type SelectFrom<Row> = {
  from(table: unknown): SelectWhere<Row>;
};

type InsertResult =
  | PromiseLike<unknown>
  | {
      onConflictDoUpdate(args: unknown): PromiseLike<unknown> | unknown;
    };

type InsertValues = {
  values(value: unknown): InsertResult;
};

export type PlayerEchoRepositoryDb<Row = PlayerEchoCanonDbRow> = {
  select(): SelectFrom<Row>;
  insert(table: unknown): InsertValues;
};

export type PlayerEchoCanonUpsertPayload = {
  insert: {
    userId: string;
    totalRuns: number;
    totalDeaths: number;
    endingsSeen: string[];
    highestFloorScore: number;
    repeatedDeathCauses: string[];
    recurringNpcBonds: Record<string, unknown>;
    unresolvedRegrets: string[];
    strongestChoices: string[];
    stableEchoSummary: string;
    lastRunSummary: string;
    echoIntensity: number;
  };
  update: {
    totalRuns: number;
    repeatedDeathCauses: string[];
    recurringNpcBonds: Record<string, unknown>;
    unresolvedRegrets: string[];
    strongestChoices: string[];
    stableEchoSummary: string;
    lastRunSummary: string;
    echoIntensity: number;
    updatedAt: unknown;
  };
};

export type PlayerEchoEventInsertValue = {
  userId: string;
  runId: string | null;
  eventType: string | null;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  emotionalWeight: number;
  safetyLevel: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readField(record: UnknownRecord, camel: string, snake: string): unknown {
  return record[camel] ?? record[snake];
}

function cleanString(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length <= maxChars ? s : s.slice(0, maxChars);
}

function cleanNullableString(value: unknown, maxChars: number): string | null {
  const s = cleanString(value, maxChars);
  return s ? s : null;
}

function cleanList(value: unknown, cap: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = cleanString(item, maxChars);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function requireUserId(userId: string): string {
  const id = cleanString(userId, 191);
  if (!id) throw new Error("playerEcho userId is required");
  return id;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return cleanNullableString(value, 80);
}

function normalizeRecurringNpcBonds(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([npcId, bond]) => {
    if (!isRecord(bond)) return { npcId, bondScore: clamp01(bond, 0) };
    return { ...bond, npcId: cleanString(bond.npcId, 40) || npcId };
  });
}

function buildNpcBondMap(bonds: readonly NpcEchoBond[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const bond of bonds.slice(0, 40)) {
    const npcId = cleanString(bond.npcId, 40);
    if (!npcId) continue;
    out[npcId] = {
      npcId,
      memoryPrivilege: bond.memoryPrivilege,
      recognitionMode: bond.recognitionMode,
      bondScore: clamp01(bond.bondScore, 0),
      fragmentIds: cleanList(bond.fragmentIds, 12, 100),
      ...(Number.isFinite(bond.lastEchoedAtLoop)
        ? { lastEchoedAtLoop: Math.max(0, Math.trunc(Number(bond.lastEchoedAtLoop))) }
        : {}),
      ...(Number.isFinite(bond.cooldownTurns)
        ? { cooldownTurns: Math.max(0, Math.min(999, Math.trunc(Number(bond.cooldownTurns)))) }
        : {}),
    };
  }
  return out;
}

function computeEchoIntensity(canon: PlayerEchoCanon): number {
  const fragmentScores = canon.fragments.map((fragment) =>
    Math.max(
      clamp01(fragment.emotionalWeight, 0),
      clamp01(fragment.salience, 0),
      clamp01(fragment.confidence, 0)
    )
  );
  const bondScores = canon.npcBonds.map((bond) => clamp01(bond.bondScore, 0));
  const strongest = Math.max(0, ...fragmentScores, ...bondScores);
  return Math.max(0, Math.min(100, Math.round(strongest * 100)));
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === "function";
}

function hasOnConflictDoUpdate(value: unknown): value is {
  onConflictDoUpdate(args: unknown): PromiseLike<unknown> | unknown;
} {
  return isRecord(value) && typeof value.onConflictDoUpdate === "function";
}

async function awaitMaybe(value: unknown): Promise<void> {
  if (isPromiseLike(value)) {
    await value;
  }
}

async function loadDefaultDb(): Promise<PlayerEchoRepositoryDb> {
  const mod = await import("@/db");
  return mod.db as unknown as PlayerEchoRepositoryDb;
}

export function normalizePlayerEchoCanonRow(row: PlayerEchoCanonDbRow | null | undefined): PlayerEchoCanon {
  const record: UnknownRecord = isRecord(row) ? row : {};
  return normalizePlayerEchoCanon({
    playerKey: readField(record, "userId", "user_id"),
    loopCount: readField(record, "totalRuns", "total_runs"),
    npcBonds: normalizeRecurringNpcBonds(readField(record, "recurringNpcBonds", "recurring_npc_bonds")),
    strongestChoices: readField(record, "strongestChoices", "strongest_choices"),
    unresolvedRegrets: readField(record, "unresolvedRegrets", "unresolved_regrets"),
    repeatedDeathCauses: readField(record, "repeatedDeathCauses", "repeated_death_causes"),
    stableEchoSummary: readField(record, "stableEchoSummary", "stable_echo_summary"),
    lastRunSummary: readField(record, "lastRunSummary", "last_run_summary"),
    updatedAt: toIsoString(readField(record, "updatedAt", "updated_at")),
  });
}

export function buildPlayerEchoCanonUpsertPayload(
  userId: string,
  input: PlayerEchoCanon
): PlayerEchoCanonUpsertPayload {
  const id = requireUserId(userId);
  const canon = normalizePlayerEchoCanon(input);
  const shared = {
    totalRuns: canon.loopCount,
    repeatedDeathCauses: cleanList(canon.repeatedDeathCauses, 6, 120),
    recurringNpcBonds: buildNpcBondMap(canon.npcBonds),
    unresolvedRegrets: cleanList(canon.unresolvedRegrets, 8, 120),
    strongestChoices: cleanList(canon.strongestChoices, 8, 120),
    stableEchoSummary: cleanString(canon.stableEchoSummary, 240),
    lastRunSummary: cleanString(canon.lastRunSummary, 240),
    echoIntensity: computeEchoIntensity(canon),
  };

  return {
    insert: {
      userId: id,
      totalDeaths: 0,
      endingsSeen: [],
      highestFloorScore: 0,
      ...shared,
    },
    update: {
      ...shared,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  };
}

export function buildPlayerEchoEventInsertValues(
  userId: string,
  runId: string | null | undefined,
  fragments: readonly EchoFragment[]
): PlayerEchoEventInsertValue[] {
  const id = requireUserId(userId);
  const cleanedRunId = cleanNullableString(runId, 191);
  return fragments
    .map((fragment) => ({
      userId: id,
      runId: cleanedRunId,
      eventType: cleanNullableString(fragment.type, 64),
      targetType: cleanNullableString(fragment.targetType, 32),
      targetId: cleanNullableString(fragment.targetId, 128),
      summary: cleanString(fragment.summary, 240),
      emotionalWeight: Math.round(clamp01(fragment.emotionalWeight, 0.5) * 100),
      safetyLevel: clampInteger(fragment.safetyLevel, 1, 0, 4),
    }))
    .filter((row) => row.summary.length > 0);
}

export function createPlayerEchoRepository(database: PlayerEchoRepositoryDb) {
  return {
    async readPlayerEchoCanon(userId: string): Promise<PlayerEchoCanon | null> {
      const id = requireUserId(userId);
      const rows = await database
        .select()
        .from(playerEchoCanon)
        .where(eq(playerEchoCanon.userId, id))
        .limit(1);
      const row = rows[0];
      return row ? normalizePlayerEchoCanonRow(row) : null;
    },

    async upsertPlayerEchoCanon(userId: string, canon: PlayerEchoCanon): Promise<void> {
      const payload = buildPlayerEchoCanonUpsertPayload(userId, canon);
      const result = database.insert(playerEchoCanon).values(payload.insert);
      if (hasOnConflictDoUpdate(result)) {
        await result.onConflictDoUpdate({
          target: playerEchoCanon.userId,
          set: payload.update,
        });
        return;
      }
      await awaitMaybe(result);
    },

    async insertPlayerEchoEvents(
      userId: string,
      runId: string | null | undefined,
      fragments: readonly EchoFragment[]
    ): Promise<number> {
      const rows = buildPlayerEchoEventInsertValues(userId, runId, fragments);
      if (rows.length === 0) return 0;
      await awaitMaybe(database.insert(playerEchoEvents).values(rows));
      return rows.length;
    },
  };
}

export async function readPlayerEchoCanon(userId: string): Promise<PlayerEchoCanon | null> {
  return createPlayerEchoRepository(await loadDefaultDb()).readPlayerEchoCanon(userId);
}

export async function upsertPlayerEchoCanon(userId: string, canon: PlayerEchoCanon): Promise<void> {
  return createPlayerEchoRepository(await loadDefaultDb()).upsertPlayerEchoCanon(userId, canon);
}

export async function insertPlayerEchoEvents(
  userId: string,
  runId: string | null | undefined,
  fragments: readonly EchoFragment[]
): Promise<number> {
  return createPlayerEchoRepository(await loadDefaultDb()).insertPlayerEchoEvents(userId, runId, fragments);
}

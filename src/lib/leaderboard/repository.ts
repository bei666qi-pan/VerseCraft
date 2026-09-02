// src/lib/leaderboard/repository.ts
//
// add-public-leaderboard：公开排行榜数据访问层。
// - 纯函数工具见 ./utils（可独立 import，避免触发 @/db 顶层 load）。
// - 不读 users.name；按 userId.slice(0,8) 派生 displayName。
// - 不复用 fetchSettlementHistoryPage（个人履历契约独立）。

import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  deriveLeaderboardDisplayName,
  normalizeLeaderboardQuery,
  type LeaderboardEntry,
  type LeaderboardQuery,
} from "./utils";

export {
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  clampLeaderboardLimit,
  clampLeaderboardOffset,
  deriveLeaderboardDisplayName,
  normalizeLeaderboardQuery,
  type LeaderboardOutcomeFilter,
  type LeaderboardGradeFilter,
  type LeaderboardQuery,
  type LeaderboardEntry,
  type NormalizedLeaderboardQuery,
} from "./utils";

function normalizeExecuteRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function rowToEntry(row: Record<string, unknown>, offset: number, index: number): LeaderboardEntry {
  const userId = String(row.userId ?? "");
  const created = row.createdAt;
  const createdAtIso =
    created instanceof Date
      ? created.toISOString()
      : typeof created === "string"
        ? created
        : "";
  return {
    rank: offset + index + 1,
    userId,
    displayName: deriveLeaderboardDisplayName(userId),
    grade: String(row.grade ?? ""),
    maxFloorScore: Number(row.maxFloorScore ?? 0),
    maxFloorLabel: String(row.maxFloorLabel ?? ""),
    survivalTimeSeconds: Number(row.survivalTimeSeconds ?? 0),
    killedAnomalies: Number(row.killedAnomalies ?? 0),
    profession: row.profession == null ? null : String(row.profession),
    outcome: String(row.outcome ?? ""),
    createdAt: createdAtIso,
  };
}

/**
 * 拉取排行榜条目（每个登录用户的最佳结算单局）。
 * 游客（user_id IS NULL）被排除。
 * 排序：max_floor_score DESC, created_at DESC（稳定排序）。
 */
export async function fetchLeaderboardEntries(
  q: LeaderboardQuery
): Promise<LeaderboardEntry[]> {
  const { limit, offset, outcome, grade } = normalizeLeaderboardQuery(q);

  const whereParts: ReturnType<typeof sql>[] = [sql`user_id IS NOT NULL`];
  if (outcome) whereParts.push(sql`outcome = ${outcome}`);
  if (grade) whereParts.push(sql`grade = ${grade}`);
  const whereClause = sql.join(whereParts, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      user_id AS "userId",
      grade,
      max_floor_score AS "maxFloorScore",
      max_floor_label AS "maxFloorLabel",
      survival_time_seconds AS "survivalTimeSeconds",
      killed_anomalies AS "killedAnomalies",
      profession,
      outcome,
      created_at AS "createdAt"
    FROM (
      SELECT DISTINCT ON (user_id)
        user_id,
        grade,
        max_floor_score,
        max_floor_label,
        survival_time_seconds,
        killed_anomalies,
        profession,
        outcome,
        created_at
      FROM settlement_histories
      WHERE ${whereClause}
      ORDER BY user_id, max_floor_score DESC, created_at DESC
    ) AS per_user_best
    ORDER BY max_floor_score DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = normalizeExecuteRows(result);
  return rows.map((r, i) => rowToEntry(r, offset, i));
}
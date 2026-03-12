"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";

type KillRow = {
  userId: string;
  userName: string;
  killedAnomalies: number;
  survivalTimeSeconds: number;
  rankPosition: number;
};

type ExploreRow = {
  userId: string;
  userName: string;
  maxFloorScore: number;
  survivalTimeSeconds: number;
  rankPosition: number;
};

type RawRow = Record<string, unknown>;

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function unwrapRows<T extends RawRow>(result: unknown): T[] {
  if (result && typeof result === "object") {
    const maybeRows = (result as { rows?: unknown }).rows;
    if (Array.isArray(maybeRows)) return maybeRows as T[];
  }
  if (Array.isArray(result) && result.length >= 1) {
    const first = result[0];
    if (Array.isArray(first)) return first as T[];
    return result as T[];
  }
  return [];
}

export type KillLeaderboardResult = {
  top10: Array<{
    userId: string;
    userName: string;
    killedAnomalies: number;
    survivalTimeSeconds: number;
    rank: number;
  }>;
  currentUser: {
    userId: string;
    userName: string;
    killedAnomalies: number;
    survivalTimeSeconds: number;
    rank: number;
  } | null;
};

export type ExplorationLeaderboardResult = {
  top10: Array<{
    userId: string;
    userName: string;
    maxFloorScore: number;
    floorText: string;
    survivalTimeSeconds: number;
    survivalText: string;
    rank: number;
  }>;
  currentUser: {
    userId: string;
    userName: string;
    maxFloorScore: number;
    floorText: string;
    survivalTimeSeconds: number;
    survivalText: string;
    rank: number;
  } | null;
};

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.trunc(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatFloor(score: number): string {
  if (score >= 99) return "通关";
  return `第${score}层`;
}

export async function submitGameRecord(input: {
  killedAnomalies: number;
  maxFloorScore: number;
  survivalTimeSeconds: number;
}): Promise<{ success: boolean; onLeaderboard?: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false };

  const killedAnomalies = Math.max(0, Math.trunc(input.killedAnomalies));
  const maxFloorScore = Math.max(0, Math.trunc(input.maxFloorScore));
  const survivalTimeSeconds = Math.max(0, Math.trunc(input.survivalTimeSeconds));

  await db.execute(sql`
    INSERT INTO game_records (user_id, killed_anomalies, max_floor_score, survival_time_seconds, created_at)
    VALUES (${userId}, ${killedAnomalies}, ${maxFloorScore}, ${survivalTimeSeconds}, NOW())
  `);

  const qualifiesKill = killedAnomalies >= 1;
  const qualifiesExplore = maxFloorScore >= 1;
  if (!qualifiesKill && !qualifiesExplore) {
    return { success: true, onLeaderboard: false };
  }

  const [killRes, exploreRes] = await Promise.all([
    qualifiesKill ? getKillLeaderboard(userId) : Promise.resolve({ currentUser: null }),
    qualifiesExplore ? getExplorationLeaderboard(userId) : Promise.resolve({ currentUser: null }),
  ]);
  const inKillTop10 = killRes.currentUser != null && killRes.currentUser.rank <= 10;
  const inExploreTop10 = exploreRes.currentUser != null && exploreRes.currentUser.rank <= 10;
  const onLeaderboard = inKillTop10 || inExploreTop10;

  revalidatePath("/");

  return { success: true, onLeaderboard };
}

export async function getKillLeaderboard(userId?: string): Promise<KillLeaderboardResult> {
  const topResult = await db.execute(sql`
    WITH ranked AS (
      SELECT
        gr.user_id AS userId,
        u.name AS userName,
        MAX(gr.killed_anomalies) AS killedAnomalies,
        MIN(gr.survival_time_seconds) AS survivalTimeSeconds,
        RANK() OVER (
          ORDER BY MAX(gr.killed_anomalies) DESC, MIN(gr.survival_time_seconds) ASC
        ) AS rankPosition
      FROM game_records gr
      INNER JOIN users u ON u.id = gr.user_id
      WHERE gr.killed_anomalies > 0
      GROUP BY gr.user_id, u.name
    )
    SELECT userId, userName, killedAnomalies, survivalTimeSeconds, rankPosition
    FROM ranked
    ORDER BY rankPosition ASC
    LIMIT 10
  `);
  const topRows = unwrapRows<KillRow>(topResult);

  const currentResult =
    userId && userId.trim()
      ? await db.execute(sql`
          WITH ranked AS (
            SELECT
              gr.user_id AS userId,
              u.name AS userName,
              MAX(gr.killed_anomalies) AS killedAnomalies,
              MIN(gr.survival_time_seconds) AS survivalTimeSeconds,
              RANK() OVER (
                ORDER BY MAX(gr.killed_anomalies) DESC, MIN(gr.survival_time_seconds) ASC
              ) AS rankPosition
            FROM game_records gr
            INNER JOIN users u ON u.id = gr.user_id
            WHERE gr.killed_anomalies > 0
            GROUP BY gr.user_id, u.name
          )
          SELECT userId, userName, killedAnomalies, survivalTimeSeconds, rankPosition
          FROM ranked
          WHERE userId = ${userId}
          LIMIT 1
        `)
      : [];
  const currentRows = unwrapRows<KillRow>(currentResult);

  const normalizedTop = topRows
    .map((row) => {
      const safeRow = row as unknown as Record<string, unknown>;
      return {
        userId: pickString(safeRow, ["userId", "user_id", "userid"]),
        userName: pickString(safeRow, ["userName", "user_name", "username"]),
        killedAnomalies: pickNumber(safeRow, [
          "killedAnomalies",
          "killed_anomalies",
          "killedanomalies",
        ]),
        survivalTimeSeconds: pickNumber(safeRow, [
          "survivalTimeSeconds",
          "survival_time_seconds",
          "survivaltimeseconds",
        ]),
        rank: pickNumber(safeRow, ["rankPosition", "rank_position", "rankposition"]),
      };
    })
    .filter((row) => row.userId && row.userName && row.rank > 0 && row.killedAnomalies > 0)
    .slice(0, 10);

  const normalizedCurrent = currentRows[0]
    ? (() => {
        const safeRow = currentRows[0] as unknown as Record<string, unknown>;
        const parsed = {
          userId: pickString(safeRow, ["userId", "user_id", "userid"]),
          userName: pickString(safeRow, ["userName", "user_name", "username"]),
          killedAnomalies: pickNumber(safeRow, [
            "killedAnomalies",
            "killed_anomalies",
            "killedanomalies",
          ]),
          survivalTimeSeconds: pickNumber(safeRow, [
            "survivalTimeSeconds",
            "survival_time_seconds",
            "survivaltimeseconds",
          ]),
          rank: pickNumber(safeRow, ["rankPosition", "rank_position", "rankposition"]),
        };
        if (!parsed.userId || !parsed.userName || parsed.rank <= 0 || parsed.killedAnomalies <= 0) {
          return null;
        }
        return parsed;
      })()
    : null;

  return {
    top10: normalizedTop,
    currentUser: normalizedCurrent,
  };
}

export async function getExplorationLeaderboard(userId?: string): Promise<ExplorationLeaderboardResult> {
  const topResult = await db.execute(sql`
    WITH ranked AS (
      SELECT
        gr.user_id AS userId,
        u.name AS userName,
        MAX(gr.max_floor_score) AS maxFloorScore,
        MIN(gr.survival_time_seconds) AS survivalTimeSeconds,
        RANK() OVER (
          ORDER BY MAX(gr.max_floor_score) DESC, MIN(gr.survival_time_seconds) ASC
        ) AS rankPosition
      FROM game_records gr
      INNER JOIN users u ON u.id = gr.user_id
      WHERE gr.max_floor_score > 0
      GROUP BY gr.user_id, u.name
    )
    SELECT userId, userName, maxFloorScore, survivalTimeSeconds, rankPosition
    FROM ranked
    ORDER BY rankPosition ASC
    LIMIT 10
  `);
  const topRows = unwrapRows<ExploreRow>(topResult);

  const currentResult =
    userId && userId.trim()
      ? await db.execute(sql`
          WITH ranked AS (
            SELECT
              gr.user_id AS userId,
              u.name AS userName,
              MAX(gr.max_floor_score) AS maxFloorScore,
              MIN(gr.survival_time_seconds) AS survivalTimeSeconds,
              RANK() OVER (
                ORDER BY MAX(gr.max_floor_score) DESC, MIN(gr.survival_time_seconds) ASC
              ) AS rankPosition
            FROM game_records gr
            INNER JOIN users u ON u.id = gr.user_id
            WHERE gr.max_floor_score > 0
            GROUP BY gr.user_id, u.name
          )
          SELECT userId, userName, maxFloorScore, survivalTimeSeconds, rankPosition
          FROM ranked
          WHERE userId = ${userId}
          LIMIT 1
        `)
      : [];
  const currentRows = unwrapRows<ExploreRow>(currentResult);

  const normalizedTop = topRows
    .map((row) => {
      const safeRow = row as unknown as Record<string, unknown>;
      const maxFloorScore = pickNumber(safeRow, ["maxFloorScore", "max_floor_score", "maxfloorscore"]);
      const survivalTimeSeconds = pickNumber(safeRow, [
        "survivalTimeSeconds",
        "survival_time_seconds",
        "survivaltimeseconds",
      ]);
      return {
        userId: pickString(safeRow, ["userId", "user_id", "userid"]),
        userName: pickString(safeRow, ["userName", "user_name", "username"]),
        maxFloorScore,
        floorText: formatFloor(maxFloorScore),
        survivalTimeSeconds,
        survivalText: formatDuration(survivalTimeSeconds),
        rank: pickNumber(safeRow, ["rankPosition", "rank_position", "rankposition"]),
      };
    })
    .filter((row) => row.userId && row.userName && row.rank > 0 && row.maxFloorScore > 0)
    .slice(0, 10);

  const normalizedCurrent = currentRows[0]
    ? (() => {
        const safeRow = currentRows[0] as unknown as Record<string, unknown>;
        const maxFloorScore = pickNumber(safeRow, ["maxFloorScore", "max_floor_score", "maxfloorscore"]);
        const survivalTimeSeconds = pickNumber(safeRow, [
          "survivalTimeSeconds",
          "survival_time_seconds",
          "survivaltimeseconds",
        ]);
        const parsed = {
          userId: pickString(safeRow, ["userId", "user_id", "userid"]),
          userName: pickString(safeRow, ["userName", "user_name", "username"]),
          maxFloorScore,
          floorText: formatFloor(maxFloorScore),
          survivalTimeSeconds,
          survivalText: formatDuration(survivalTimeSeconds),
          rank: pickNumber(safeRow, ["rankPosition", "rank_position", "rankposition"]),
        };
        if (!parsed.userId || !parsed.userName || parsed.rank <= 0 || parsed.maxFloorScore <= 0) {
          return null;
        }
        return parsed;
      })()
    : null;

  return {
    top10: normalizedTop,
    currentUser: normalizedCurrent,
  };
}

"use server";

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
}): Promise<{ success: boolean }> {
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

  return { success: true };
}

export async function getKillLeaderboard(userId?: string): Promise<KillLeaderboardResult> {
  const topRows = (await db.execute(sql`
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
  `)) as unknown as KillRow[];

  const currentRows =
    userId && userId.trim()
      ? ((await db.execute(sql`
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
        `)) as unknown as KillRow[])
      : [];

  return {
    top10: topRows.map((row) => {
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
    }),
    currentUser: currentRows[0]
      ? (() => {
          const safeRow = currentRows[0] as unknown as Record<string, unknown>;
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
        })()
      : null,
  };
}

export async function getExplorationLeaderboard(userId?: string): Promise<ExplorationLeaderboardResult> {
  const topRows = (await db.execute(sql`
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
  `)) as unknown as ExploreRow[];

  const currentRows =
    userId && userId.trim()
      ? ((await db.execute(sql`
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
        `)) as unknown as ExploreRow[])
      : [];

  return {
    top10: topRows.map((row) => {
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
    }),
    currentUser: currentRows[0]
      ? (() => {
          const safeRow = currentRows[0] as unknown as Record<string, unknown>;
          const maxFloorScore = pickNumber(safeRow, [
            "maxFloorScore",
            "max_floor_score",
            "maxfloorscore",
          ]);
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
        })()
      : null,
  };
}

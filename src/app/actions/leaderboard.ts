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
    top10: topRows.map((row) => ({
      userId: row.userId,
      userName: row.userName,
      killedAnomalies: Number(row.killedAnomalies),
      survivalTimeSeconds: Number(row.survivalTimeSeconds),
      rank: Number(row.rankPosition),
    })),
    currentUser: currentRows[0]
      ? {
          userId: currentRows[0].userId,
          userName: currentRows[0].userName,
          killedAnomalies: Number(currentRows[0].killedAnomalies),
          survivalTimeSeconds: Number(currentRows[0].survivalTimeSeconds),
          rank: Number(currentRows[0].rankPosition),
        }
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
    top10: topRows.map((row) => ({
      userId: row.userId,
      userName: row.userName,
      maxFloorScore: Number(row.maxFloorScore),
      floorText: formatFloor(Number(row.maxFloorScore)),
      survivalTimeSeconds: Number(row.survivalTimeSeconds),
      survivalText: formatDuration(Number(row.survivalTimeSeconds)),
      rank: Number(row.rankPosition),
    })),
    currentUser: currentRows[0]
      ? {
          userId: currentRows[0].userId,
          userName: currentRows[0].userName,
          maxFloorScore: Number(currentRows[0].maxFloorScore),
          floorText: formatFloor(Number(currentRows[0].maxFloorScore)),
          survivalTimeSeconds: Number(currentRows[0].survivalTimeSeconds),
          survivalText: formatDuration(Number(currentRows[0].survivalTimeSeconds)),
          rank: Number(currentRows[0].rankPosition),
        }
      : null,
  };
}

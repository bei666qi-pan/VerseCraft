"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { gameRecords, settlementHistories } from "@/db/schema";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { recordGameRecordSubmittedAnalytics, recordGenericAnalyticsEvent } from "@/lib/analytics/repository";
import { formatDurationSeconds } from "@/lib/time/durationUnits";

const SETTLEMENT_MARKDOWN_MAX_CHARS = 200_000;
const SETTLEMENT_RECAP_MAX_CHARS = 12_000;

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

function formatFloor(score: number): string {
  if (score >= 99) return "通关";
  return `第${score}层`;
}

export async function submitGameRecord(input: {
  killedAnomalies: number;
  maxFloorScore: number;
  survivalTimeSeconds: number;
  outcome?: "victory" | "death" | "abandon";
  /** 登录用户写入 settlement_histories，与排行榜行同属一次结算 */
  history?: {
    grade: string;
    survivalDay: number;
    survivalHour: number;
    maxFloorLabel: string;
    profession: string | null;
    recapSummary: string;
    isDead: boolean;
    hasEscaped: boolean;
    writingMarkdown?: string | null;
  };
}): Promise<{ success: boolean; onLeaderboard?: boolean; historyId?: number | null }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false };

  const killedAnomalies = Math.max(0, Math.trunc(input.killedAnomalies));
  const maxFloorScore = Math.max(0, Math.trunc(input.maxFloorScore));
  const survivalTimeSeconds = Math.max(0, Math.trunc(input.survivalTimeSeconds));
  const outcome = input.outcome ?? "abandon";

  await db.insert(gameRecords).values({
    userId,
    killedAnomalies,
    maxFloorScore,
    survivalTimeSeconds,
  });

  let historyId: number | null = null;
  const h = input.history;
  if (h) {
    const grade = (h.grade ?? "E").slice(0, 2);
    const recap = (h.recapSummary ?? "").slice(0, SETTLEMENT_RECAP_MAX_CHARS);
    const floorLabel = (h.maxFloorLabel ?? "").slice(0, 64);
    const profession = h.profession ? h.profession.slice(0, 64) : null;
    let md: string | null = null;
    if (typeof h.writingMarkdown === "string" && h.writingMarkdown.length > 0) {
      md = h.writingMarkdown.slice(0, SETTLEMENT_MARKDOWN_MAX_CHARS);
    }
    const inserted = await db
      .insert(settlementHistories)
      .values({
        userId,
        grade,
        survivalTimeSeconds,
        survivalDay: Math.max(0, Math.trunc(h.survivalDay)),
        survivalHour: Math.max(0, Math.trunc(h.survivalHour)),
        killedAnomalies,
        maxFloorScore,
        maxFloorLabel: floorLabel,
        profession,
        recapSummary: recap || "（无复盘摘要）",
        isDead: !!h.isDead,
        hasEscaped: !!h.hasEscaped,
        outcome,
        writingMarkdown: md,
      })
      .returning({ id: settlementHistories.id });
    historyId = inserted[0]?.id ?? null;
  }

  // Analytics best-effort: game completion (idempotent by day + score tuple).
  void recordGameRecordSubmittedAnalytics({
    eventId: `${userId}:game_record_submitted:${Date.now()}`,
    idempotencyKey: (() => {
      const dateKey = getUtcDateKey(new Date());
      return `game_record_submitted:${userId}:${dateKey}:${killedAnomalies}:${maxFloorScore}:${survivalTimeSeconds}`;
    })(),
    userId,
    sessionId: "system",
    eventTime: new Date(),
    page: "/settlement",
    source: "leaderboard",
    platform: "unknown",
    payload: {
      killedAnomalies,
      maxFloorScore,
      survivalTimeSeconds,
      outcome,
    },
  }).catch(() => {});

  void recordGenericAnalyticsEvent({
    eventId: `${userId}:game_settlement:${Date.now()}`,
    idempotencyKey: `game_settlement:${userId}:${getUtcDateKey(new Date())}:${outcome}:${maxFloorScore}:${survivalTimeSeconds}`,
    userId,
    sessionId: "system",
    eventTime: new Date(),
    eventName: "game_settlement",
    page: "/settlement",
    source: "leaderboard",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      outcome,
      killedAnomalies,
      maxFloorScore,
      survivalTimeSeconds,
    },
  }).catch(() => {});

  const qualifiesExplore = maxFloorScore >= 1;
  if (!qualifiesExplore) {
    revalidatePath("/history");
    return { success: true, onLeaderboard: false, historyId };
  }

  const exploreRes = await getExplorationLeaderboard(userId);
  const onLeaderboard = exploreRes.currentUser != null && exploreRes.currentUser.rank <= 10;

  revalidatePath("/");
  revalidatePath("/history");

  return { success: true, onLeaderboard, historyId };
}

export async function getExplorationLeaderboard(userId?: string): Promise<ExplorationLeaderboardResult> {
  const topResult = await db.execute(sql`
    WITH agg AS (
      SELECT
        gr.user_id AS userId,
        u.name AS userName,
        MAX(gr.max_floor_score) AS maxFloorScore,
        MIN(gr.survival_time_seconds) AS survivalTimeSeconds
      FROM game_records gr
      INNER JOIN users u ON u.id = gr.user_id
      WHERE gr.max_floor_score > 0
      GROUP BY gr.user_id, u.name
    ),
    ranked AS (
      SELECT
        userId,
        userName,
        maxFloorScore,
        survivalTimeSeconds,
        RANK() OVER (
          ORDER BY maxFloorScore DESC, survivalTimeSeconds ASC
        ) AS rankPosition
      FROM agg
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
          WITH agg AS (
            SELECT
              gr.user_id AS userId,
              u.name AS userName,
              MAX(gr.max_floor_score) AS maxFloorScore,
              MIN(gr.survival_time_seconds) AS survivalTimeSeconds
            FROM game_records gr
            INNER JOIN users u ON u.id = gr.user_id
            WHERE gr.max_floor_score > 0
            GROUP BY gr.user_id, u.name
          ),
          ranked AS (
            SELECT
              userId,
              userName,
              maxFloorScore,
              survivalTimeSeconds,
              RANK() OVER (
                ORDER BY maxFloorScore DESC, survivalTimeSeconds ASC
              ) AS rankPosition
            FROM agg
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
        survivalText: formatDurationSeconds(survivalTimeSeconds, { style: "compact_cn" }),
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
          survivalText: formatDurationSeconds(survivalTimeSeconds, { style: "compact_cn" }),
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

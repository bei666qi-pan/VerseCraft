"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { settlementHistories } from "@/db/schema";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";

const SETTLEMENT_MARKDOWN_MAX_CHARS = 200_000;
const SETTLEMENT_RECAP_MAX_CHARS = 12_000;

export type SettlementHistoryListItem = {
  id: number;
  createdAt: string;
  grade: string;
  survivalTimeSeconds: number;
  survivalDay: number;
  survivalHour: number;
  killedAnomalies: number;
  maxFloorScore: number;
  maxFloorLabel: string;
  profession: string | null;
  recapSummary: string;
  aiRecapSummary: string | null;
  isDead: boolean;
  hasEscaped: boolean;
  outcome: string;
  hasWritingMarkdown: boolean;
};

function mapRow(row: typeof settlementHistories.$inferSelect): SettlementHistoryListItem {
  const created =
    row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt as unknown as string);
  return {
    id: row.id,
    createdAt: created.toISOString(),
    grade: row.grade,
    survivalTimeSeconds: row.survivalTimeSeconds,
    survivalDay: row.survivalDay,
    survivalHour: row.survivalHour,
    killedAnomalies: row.killedAnomalies,
    maxFloorScore: row.maxFloorScore,
    maxFloorLabel: row.maxFloorLabel,
    profession: row.profession ?? null,
    recapSummary: row.recapSummary,
    aiRecapSummary: row.aiRecapSummary ?? null,
    isDead: row.isDead,
    hasEscaped: row.hasEscaped,
    outcome: row.outcome,
    hasWritingMarkdown: typeof row.writingMarkdown === "string" && row.writingMarkdown.length > 0,
  };
}

export async function submitSettlementHistory(input: {
  killedAnomalies: number;
  maxFloorScore: number;
  survivalTimeSeconds: number;
  outcome?: "victory" | "death" | "abandon" | "doom" | "true_escape" | "costly_escape" | "false_escape";
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
}): Promise<{ success: boolean; historyId?: number | null }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { success: false, historyId: null };

  const killedAnomalies = Math.max(0, Math.trunc(input.killedAnomalies));
  const maxFloorScore = Math.max(0, Math.trunc(input.maxFloorScore));
  const survivalTimeSeconds = Math.max(0, Math.trunc(input.survivalTimeSeconds));
  const outcome = input.outcome ?? "abandon";
  const h = input.history;

  let historyId: number | null = null;
  if (h) {
    const grade = (h.grade ?? "E").slice(0, 2);
    const recap = (h.recapSummary ?? "").slice(0, SETTLEMENT_RECAP_MAX_CHARS);
    const floorLabel = (h.maxFloorLabel ?? "").slice(0, 64);
    const profession = h.profession ? h.profession.slice(0, 64) : null;
    const writingMarkdown =
      typeof h.writingMarkdown === "string" && h.writingMarkdown.length > 0
        ? h.writingMarkdown.slice(0, SETTLEMENT_MARKDOWN_MAX_CHARS)
        : null;

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
        writingMarkdown,
      })
      .returning({ id: settlementHistories.id });
    historyId = inserted[0]?.id ?? null;
  }

  void recordGenericAnalyticsEvent({
    eventId: `${userId}:game_settlement:${Date.now()}`,
    idempotencyKey: `game_settlement:${userId}:${getUtcDateKey(new Date())}:${outcome}:${maxFloorScore}:${survivalTimeSeconds}`,
    userId,
    sessionId: "system",
    eventTime: new Date(),
    eventName: "game_settlement",
    page: "/settlement",
    source: "settlement_history",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      outcome,
      killedAnomalies,
      maxFloorScore,
      survivalTimeSeconds,
      historyId,
    },
  }).catch(() => {});

  revalidatePath("/history");
  return { success: true, historyId };
}

export async function fetchSettlementHistoryPage(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ items: SettlementHistoryListItem[]; total: number }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { items: [], total: 0 };

  const limit = Math.min(50, Math.max(1, opts?.limit ?? 24));
  const offset = Math.max(0, opts?.offset ?? 0);

  const [{ total }] = await db
    .select({ total: count() })
    .from(settlementHistories)
    .where(eq(settlementHistories.userId, userId));

  const rows = await db
    .select()
    .from(settlementHistories)
    .where(eq(settlementHistories.userId, userId))
    .orderBy(desc(settlementHistories.createdAt))
    .limit(limit)
    .offset(offset);

  return { items: rows.map(mapRow), total: Number(total) };
}

/** 历史中心内下载该次结算绑定的写作记录（与结算页导出同源） */
export async function fetchSettlementWritingMarkdown(historyId: number): Promise<{ markdown: string | null }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { markdown: null };
  const rows = await db
    .select({ writingMarkdown: settlementHistories.writingMarkdown })
    .from(settlementHistories)
    .where(and(eq(settlementHistories.id, historyId), eq(settlementHistories.userId, userId)))
    .limit(1);
  const md = rows[0]?.writingMarkdown;
  return { markdown: typeof md === "string" && md.length > 0 ? md : null };
}

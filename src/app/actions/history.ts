"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { settlementHistories } from "@/db/schema";

const AI_RECAP_MAX = 12_000;

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

/** AI 复盘异步就绪后补写，不阻塞结算主路径 */
export async function enrichSettlementHistoryAiRecap(input: {
  historyId: number;
  aiSummary: string;
}): Promise<{ ok: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false };
  const summary = input.aiSummary.trim().slice(0, AI_RECAP_MAX);
  if (!summary) return { ok: false };
  await db
    .update(settlementHistories)
    .set({ aiRecapSummary: summary })
    .where(and(eq(settlementHistories.id, input.historyId), eq(settlementHistories.userId, userId)));
  return { ok: true };
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

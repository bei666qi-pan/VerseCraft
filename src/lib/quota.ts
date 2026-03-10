// src/lib/quota.ts
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { usersQuota } from "@/db/schema";

const DAILY_TOKEN_LIMIT = Number(process.env.DAILY_TOKEN_LIMIT) || 50_000;
const DAILY_ACTION_LIMIT = Number(process.env.DAILY_ACTION_LIMIT) || 200;

export type QuotaCheckResult =
  | { ok: true }
  | { ok: false; reason: "banned" | "token_limit" | "action_limit" };

export async function checkQuota(
  userId: string,
  estimatedTokens: number
): Promise<QuotaCheckResult> {
  const rows = await db
    .select({
      dailyTokens: usersQuota.dailyTokens,
      dailyActions: usersQuota.dailyActions,
      lastActionDate: usersQuota.lastActionDate,
      isBanned: usersQuota.isBanned,
    })
    .from(usersQuota)
    .where(eq(usersQuota.userId, userId))
    .limit(1);

  const today = new Date().toISOString().slice(0, 10);
  const row = rows[0];

  if (row?.isBanned) return { ok: false, reason: "banned" };

  const lastDate = row?.lastActionDate ? String(row.lastActionDate).slice(0, 10) : null;
  const dailyTokens = row?.lastActionDate && lastDate === today ? (row.dailyTokens ?? 0) : 0;
  const dailyActions = row?.lastActionDate && lastDate === today ? (row.dailyActions ?? 0) : 0;

  if (dailyTokens + estimatedTokens > DAILY_TOKEN_LIMIT) {
    return { ok: false, reason: "token_limit" };
  }
  if (dailyActions + 1 > DAILY_ACTION_LIMIT) {
    return { ok: false, reason: "action_limit" };
  }
  return { ok: true };
}

export async function incrementQuota(
  userId: string,
  actualTokens: number
): Promise<void> {
  const tokenDelta = Math.max(0, Math.trunc(actualTokens));
  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(usersQuota)
    .values({
      userId,
      dailyTokens: tokenDelta,
      dailyActions: 1,
      lastActionDate: today,
    })
    .onDuplicateKeyUpdate({
      set: {
        dailyTokens: sql`CASE 
          WHEN DATE(${usersQuota.lastActionDate}) < CURDATE() THEN ${tokenDelta}
          ELSE ${usersQuota.dailyTokens} + ${tokenDelta}
        END`,
        dailyActions: sql`CASE 
          WHEN DATE(${usersQuota.lastActionDate}) < CURDATE() THEN 1
          ELSE ${usersQuota.dailyActions} + 1
        END`,
        lastActionDate: sql`CURDATE()`,
      },
    });
}

export function estimateTokensFromInput(systemPrompt: string, messages: { content: string }[]): number {
  let chars = systemPrompt.length;
  for (const m of messages) {
    chars += typeof m.content === "string" ? m.content.length : 0;
  }
  return Math.max(1500, Math.ceil(chars / 2) + 2000);
}

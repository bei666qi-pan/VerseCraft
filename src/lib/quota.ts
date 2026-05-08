// src/lib/quota.ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { guestDailyTokens, surveyResponses, usersQuota } from "@/db/schema";
import { env } from "@/lib/env";
import {
  buildQuotaLimitNarrative,
  computeDailyTokenLimit,
  type QuotaActorType,
  type QuotaDenialReason,
} from "@/lib/quotaPolicy";

const REGISTERED_DAILY_TOKEN_LIMIT = env.dailyTokenLimit;
const GUEST_DAILY_TOKEN_LIMIT = env.guestDailyTokenLimit;
const SURVEY_BONUS_DAILY_TOKEN_LIMIT = env.surveyBonusDailyTokenLimit;
const DAILY_ACTION_LIMIT = env.dailyActionLimit;

export type QuotaCheckInput = {
  userId?: string | null;
  guestId?: string | null;
  estimatedTokens: number;
};

export type QuotaCheckResult =
  | {
      ok: true;
      actorType: QuotaActorType;
      dailyTokenLimit: number;
      usedTokens: number;
      bonusTokens: number;
      hasSurveyBonus: boolean;
      remainingTokens: number;
    }
  | {
      ok: false;
      reason: QuotaDenialReason;
      actorType: QuotaActorType;
      dailyTokenLimit: number;
      usedTokens: number;
      bonusTokens: number;
      hasSurveyBonus: boolean;
      estimatedTokens: number;
    };

function normalizeEstimatedTokens(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function hasUserSurveyBonus(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: surveyResponses.id })
    .from(surveyResponses)
    .where(eq(surveyResponses.userId, userId))
    .limit(1);
  return rows.length > 0;
}

async function checkRegisteredUserQuota(
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

  const today = todayDateKey();
  const row = rows[0];
  const hasSurveyBonus = await hasUserSurveyBonus(userId);
  const dailyTokenLimit = computeDailyTokenLimit({
    actorType: "registered",
    registeredDailyTokenLimit: REGISTERED_DAILY_TOKEN_LIMIT,
    guestDailyTokenLimit: GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    hasSurveyBonus,
  });
  const bonusTokens = hasSurveyBonus ? SURVEY_BONUS_DAILY_TOKEN_LIMIT : 0;

  if (row?.isBanned) {
    return {
      ok: false,
      reason: "banned",
      actorType: "registered",
      dailyTokenLimit,
      usedTokens: 0,
      bonusTokens,
      hasSurveyBonus,
      estimatedTokens,
    };
  }

  const lastDate = row?.lastActionDate ? String(row.lastActionDate).slice(0, 10) : null;
  const dailyTokens = row?.lastActionDate && lastDate === today ? (row.dailyTokens ?? 0) : 0;
  const dailyActions = row?.lastActionDate && lastDate === today ? (row.dailyActions ?? 0) : 0;

  if (dailyTokens + estimatedTokens > dailyTokenLimit) {
    return {
      ok: false,
      reason: "token_limit",
      actorType: "registered",
      dailyTokenLimit,
      usedTokens: dailyTokens,
      bonusTokens,
      hasSurveyBonus,
      estimatedTokens,
    };
  }
  if (dailyActions + 1 > DAILY_ACTION_LIMIT) {
    return {
      ok: false,
      reason: "action_limit",
      actorType: "registered",
      dailyTokenLimit,
      usedTokens: dailyTokens,
      bonusTokens,
      hasSurveyBonus,
      estimatedTokens,
    };
  }
  return {
    ok: true,
    actorType: "registered",
    dailyTokenLimit,
    usedTokens: dailyTokens,
    bonusTokens,
    hasSurveyBonus,
    remainingTokens: Math.max(0, dailyTokenLimit - dailyTokens - estimatedTokens),
  };
}

async function checkGuestQuota(
  guestId: string,
  estimatedTokens: number
): Promise<QuotaCheckResult> {
  const dailyTokenLimit = computeDailyTokenLimit({
    actorType: "guest",
    registeredDailyTokenLimit: REGISTERED_DAILY_TOKEN_LIMIT,
    guestDailyTokenLimit: GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: SURVEY_BONUS_DAILY_TOKEN_LIMIT,
  });
  const rows = await db
    .select({ dailyTokenCost: guestDailyTokens.dailyTokenCost })
    .from(guestDailyTokens)
    .where(and(eq(guestDailyTokens.guestId, guestId), eq(guestDailyTokens.dateKey, todayDateKey())))
    .limit(1);
  const usedTokens = rows[0]?.dailyTokenCost ?? 0;
  if (usedTokens + estimatedTokens > dailyTokenLimit) {
    return {
      ok: false,
      reason: "token_limit",
      actorType: "guest",
      dailyTokenLimit,
      usedTokens,
      bonusTokens: 0,
      hasSurveyBonus: false,
      estimatedTokens,
    };
  }
  return {
    ok: true,
    actorType: "guest",
    dailyTokenLimit,
    usedTokens,
    bonusTokens: 0,
    hasSurveyBonus: false,
    remainingTokens: Math.max(0, dailyTokenLimit - usedTokens - estimatedTokens),
  };
}

export function buildQuotaLimitMessage(result: Extract<QuotaCheckResult, { ok: false }>): string {
  return buildQuotaLimitNarrative({
    actorType: result.actorType,
    reason: result.reason,
    dailyTokenLimit: result.dailyTokenLimit,
    surveyBonusDailyTokenLimit: SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    hasSurveyBonus: result.hasSurveyBonus,
  });
}

export async function checkQuota(userId: string, estimatedTokens: number): Promise<QuotaCheckResult>;
export async function checkQuota(input: QuotaCheckInput): Promise<QuotaCheckResult>;
export async function checkQuota(
  inputOrUserId: string | QuotaCheckInput,
  estimatedTokensArg = 0
): Promise<QuotaCheckResult> {
  const input =
    typeof inputOrUserId === "string"
      ? { userId: inputOrUserId, estimatedTokens: estimatedTokensArg }
      : inputOrUserId;
  const estimatedTokens = normalizeEstimatedTokens(input.estimatedTokens);
  const userId = typeof input.userId === "string" && input.userId.trim() ? input.userId.trim() : null;
  const guestId = typeof input.guestId === "string" && input.guestId.trim() ? input.guestId.trim() : null;

  if (userId) return checkRegisteredUserQuota(userId, estimatedTokens);
  if (guestId) return checkGuestQuota(guestId, estimatedTokens);

  const dailyTokenLimit = computeDailyTokenLimit({
    actorType: "guest",
    registeredDailyTokenLimit: REGISTERED_DAILY_TOKEN_LIMIT,
    guestDailyTokenLimit: GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: SURVEY_BONUS_DAILY_TOKEN_LIMIT,
  });
  return {
    ok: true,
    actorType: "guest",
    dailyTokenLimit,
    usedTokens: 0,
    bonusTokens: 0,
    hasSurveyBonus: false,
    remainingTokens: dailyTokenLimit,
  };
}

export async function incrementQuota(
  userId: string,
  actualTokens: number
): Promise<void> {
  const tokenDelta = Math.max(0, Math.trunc(actualTokens));
  await db
    .insert(usersQuota)
    .values({
      userId,
      dailyTokens: tokenDelta,
      dailyActions: 1,
      lastActionDate: sql`CURRENT_DATE`,
    })
    .onConflictDoUpdate({
      target: usersQuota.userId,
      set: {
        dailyTokens: sql`CASE 
          WHEN ${usersQuota.lastActionDate} < CURRENT_DATE THEN ${tokenDelta}
          ELSE ${usersQuota.dailyTokens} + ${tokenDelta}
        END`,
        dailyActions: sql`CASE 
          WHEN ${usersQuota.lastActionDate} < CURRENT_DATE THEN 1
          ELSE ${usersQuota.dailyActions} + 1
        END`,
        lastActionDate: sql`CURRENT_DATE`,
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

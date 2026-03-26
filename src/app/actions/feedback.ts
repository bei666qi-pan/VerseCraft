"use server";

import { createHash } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { feedbacks, surveyResponses } from "@/db/schema";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import {
  recordFeedbackSubmittedAnalytics,
  recordGenericAnalyticsEvent,
} from "@/lib/analytics/repository";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";
import {
  normalizeHomeSurveyAnswers,
  type HomeSurveyAnswers,
} from "@/lib/survey/productSurveyHomeV1";

type FeedbackActionResult = {
  success: boolean;
  message: string;
};

function isValidGuestId(id: string | null | undefined): id is string {
  if (!id || typeof id !== "string") return false;
  const t = id.trim();
  return /^[a-zA-Z0-9:_-]{8,128}$/.test(t);
}

async function hasSurveyResponse(
  surveyKey: string,
  userId: string | null,
  guestId: string | null
): Promise<boolean> {
  const gid = guestId?.trim() || null;
  const condKey = eq(surveyResponses.surveyKey, surveyKey);

  if (userId) {
    const parts = [eq(surveyResponses.userId, userId)];
    if (gid && isValidGuestId(gid)) {
      parts.push(eq(surveyResponses.guestId, gid));
    }
    const rows = await db
      .select({ id: surveyResponses.id })
      .from(surveyResponses)
      .where(and(condKey, or(...parts)))
      .limit(1);
    return rows.length > 0;
  }

  if (gid && isValidGuestId(gid)) {
    const rows = await db
      .select({ id: surveyResponses.id })
      .from(surveyResponses)
      .where(and(condKey, eq(surveyResponses.guestId, gid)))
      .limit(1);
    return rows.length > 0;
  }
  return false;
}

export async function getSurveyCompletionStatus(input: {
  surveyKey: string;
  guestId: string | null;
}): Promise<{ completed: boolean }> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const completed = await hasSurveyResponse(input.surveyKey, userId, input.guestId);
  return { completed };
}

export async function submitProductSurvey(input: {
  surveyKey: string;
  surveyVersion: string;
  guestId: string | null;
  source?: string;
  answers: unknown;
  freeText?: string;
  overallRating: number;
  recommendScore?: number | null;
  contactIntent: boolean;
  consent: { userAgreement: boolean; privacyPolicy: boolean };
  clientMeta?: Record<string, unknown>;
}): Promise<FeedbackActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const gidRaw = input.guestId?.trim() || null;

  if (!input.consent?.userAgreement || !input.consent?.privacyPolicy) {
    return { success: false, message: "请先勾选用户协议与隐私政策后再提交。" };
  }

  const answers = normalizeHomeSurveyAnswers(input.answers);
  if (!answers) {
    return { success: false, message: "请完整填写结构化选项。" };
  }

  if (!userId && !isValidGuestId(gidRaw)) {
    return { success: false, message: "无法识别设备标识，请刷新页面后重试，或登录后提交。" };
  }

  const dup = await hasSurveyResponse(input.surveyKey, userId, gidRaw);
  if (dup) {
    return { success: false, message: "你已提交过本问卷，感谢支持。" };
  }

  const rawRating = Number(input.overallRating);
  if (!Number.isFinite(rawRating)) {
    return { success: false, message: "请选择总体满意度（1–5）。" };
  }
  const rating = Math.max(1, Math.min(5, Math.round(rawRating)));

  let rec: number | null = null;
  if (input.recommendScore !== undefined && input.recommendScore !== null) {
    const r = Math.round(Number(input.recommendScore));
    if (Number.isFinite(r) && r >= 0 && r <= 10) rec = r;
  }

  const free = (input.freeText ?? "").trim().slice(0, 1500);
  if (free.length > 0) {
    const safety = await moderateInputOnServer({
      scene: "feedback_input",
      text: free,
      userId: userId ?? undefined,
      sessionId: gidRaw ? `guest:${gidRaw}` : "system",
    });
    if (safety.decision !== "allow") {
      return { success: false, message: safety.userMessage };
    }
  }

  try {
    await db.insert(surveyResponses).values({
      userId: userId ?? null,
      guestId: gidRaw && isValidGuestId(gidRaw) ? gidRaw : null,
      surveyKey: input.surveyKey.slice(0, 64),
      surveyVersion: input.surveyVersion.slice(0, 32),
      source: (input.source ?? "home_modal").slice(0, 64),
      answers: answers as unknown as Record<string, unknown>,
      freeText: free.length > 0 ? free : null,
      overallRating: rating,
      recommendScore: rec,
      contactIntent: !!input.contactIntent,
      userAgreement: true,
      privacyPolicy: true,
      clientMeta: input.clientMeta ?? {},
    });

    const anonKey = userId ?? `guest:${gidRaw ?? "unknown"}`;
    void recordGenericAnalyticsEvent({
      eventId: `${anonKey}:survey_embedded:${Date.now()}`,
      idempotencyKey: `survey_embedded:${input.surveyKey}:${anonKey}:${getUtcDateKey(new Date())}`,
      userId: userId,
      sessionId: gidRaw ? `survey:${gidRaw}` : "survey:user",
      eventName: "survey_submitted",
      eventTime: new Date(),
      page: "/",
      source: "survey_embedded",
      platform: "unknown",
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        surveyKey: input.surveyKey,
        surveyVersion: input.surveyVersion,
        mode: "embedded",
        // 兼容首页问卷新版字段；用于统计分析，不参与业务逻辑。
        createFriction: (answers as HomeSurveyAnswers).createFriction,
        immersionIssue: (answers as HomeSurveyAnswers).immersionIssue,
        coreFunPoint: (answers as HomeSurveyAnswers).coreFunPoint,
        topFixOne: (answers as HomeSurveyAnswers).topFixOne,
      },
    }).catch(() => {});

    return { success: true, message: "提交成功" };
  } catch (err) {
    console.error("[feedback] submitProductSurvey failed", err);
    return { success: false, message: "提交失败，请稍后再试。" };
  }
}

export async function submitFeedback(
  content: string,
  consent?: { userAgreement: boolean; privacyPolicy: boolean },
  meta?: { guestId?: string | null; clientMeta?: Record<string, unknown> }
): Promise<FeedbackActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!consent || !consent.userAgreement || !consent.privacyPolicy) {
    return { success: false, message: "请先勾选用户协议与隐私政策后再提交。" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, message: "意见内容不能为空。" };
  }
  if (trimmed.length > 2000) {
    return { success: false, message: "意见内容请控制在 2000 字以内。" };
  }

  const gidRaw = meta?.guestId?.trim() || null;

  const safety = await moderateInputOnServer({
    scene: "feedback_input",
    text: trimmed,
    userId: userId ?? undefined,
    sessionId: gidRaw ? `guest:${gidRaw}` : "system",
  });
  if (safety.decision !== "allow") {
    return { success: false, message: safety.userMessage };
  }

  try {
    if (userId) {
      await db.insert(feedbacks).values({
        userId,
        guestId: gidRaw && isValidGuestId(gidRaw) ? gidRaw : null,
        content: trimmed,
        kind: "open",
        clientMeta: meta?.clientMeta ?? {},
      });
    } else {
      if (!isValidGuestId(gidRaw)) {
        return { success: false, message: "无法识别设备标识，请刷新后重试或登录后提交。" };
      }
      await db.insert(feedbacks).values({
        userId: null,
        guestId: gidRaw,
        content: trimmed,
        kind: "open",
        clientMeta: meta?.clientMeta ?? {},
      });
    }

    void recordFeedbackSubmittedAnalytics({
      eventId: `${userId ?? gidRaw}:feedback_submitted:${Date.now()}`,
      idempotencyKey: (() => {
        const dateKey = getUtcDateKey(new Date());
        const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
        const who = userId ?? `g:${gidRaw}`;
        return `feedback_submitted:${who}:${dateKey}:${hash}`;
      })(),
      userId: userId,
      sessionId: "system",
      eventTime: new Date(),
      page: "/",
      source: "feedback",
      platform: "unknown",
      payload: { contentLength: trimmed.length, guest: !userId },
    }).catch(() => {});

    return { success: true, message: "提交成功" };
  } catch (error) {
    console.error("[feedback] submit failed", error);
    return { success: false, message: "提交失败，请稍后再试。" };
  }
}

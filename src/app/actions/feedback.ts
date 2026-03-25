"use server";

import { createHash } from "node:crypto";
import { auth } from "../../../auth";
import { db } from "@/db";
import { feedbacks } from "@/db/schema";
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { recordFeedbackSubmittedAnalytics } from "@/lib/analytics/repository";
import { moderateInputOnServer } from "@/lib/safety/input/pipeline";

type FeedbackActionResult = {
  success: boolean;
  message: string;
};

export async function submitFeedback(
  content: string,
  consent?: { userAgreement: boolean; privacyPolicy: boolean }
): Promise<FeedbackActionResult> {
  const session = await auth();
  const userId = session?.user?.id;

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

  const safety = await moderateInputOnServer({
    scene: "feedback_input",
    text: trimmed,
    userId: userId ?? undefined,
    sessionId: "system",
  });
  if (safety.decision !== "allow") {
    return { success: false, message: safety.userMessage };
  }

  if (!userId) {
    // Guests can also submit feedback; we acknowledge receipt without user-bound persistence.
    return { success: true, message: "提交成功" };
  }

  try {
    await db.insert(feedbacks).values({
      userId,
      content: trimmed,
    });

    // Analytics best-effort: feedback submission count.
    void recordFeedbackSubmittedAnalytics({
      eventId: `${userId}:feedback_submitted:${Date.now()}`,
      idempotencyKey: (() => {
        const dateKey = getUtcDateKey(new Date());
        const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
        return `feedback_submitted:${userId}:${dateKey}:${hash}`;
      })(),
      userId,
      sessionId: "system",
      eventTime: new Date(),
      page: "/",
      source: "feedback",
      platform: "unknown",
      payload: { contentLength: trimmed.length },
    }).catch(() => {});

    return { success: true, message: "提交成功" };
  } catch (error) {
    console.error("[feedback] submit failed", error);
    return { success: false, message: "提交失败，请稍后再试。" };
  }
}

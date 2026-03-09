"use server";

import { auth } from "../../../auth";
import { db } from "@/db";
import { feedbacks } from "@/db/schema";

type FeedbackActionResult = {
  success: boolean;
  message: string;
};

export async function submitFeedback(content: string): Promise<FeedbackActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { success: false, message: "未登录，无法提交意见。" };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { success: false, message: "意见内容不能为空。" };
  }
  if (trimmed.length > 2000) {
    return { success: false, message: "意见内容请控制在 2000 字以内。" };
  }

  try {
    await db.insert(feedbacks).values({
      userId,
      content: trimmed,
    });
    return { success: true, message: "提交成功" };
  } catch (error) {
    console.error("[feedback] submit failed", error);
    return { success: false, message: "提交失败，请稍后再试。" };
  }
}

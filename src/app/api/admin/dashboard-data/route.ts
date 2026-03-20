import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { feedbacks, users } from "@/db/schema";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getOnlineUsersFromPresence } from "@/lib/presence";
import { getAdminChartData } from "@/lib/adminDailyMetrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        tokensUsed: users.tokensUsed,
        todayTokensUsed: users.todayTokensUsed,
        playTime: users.playTime,
        todayPlayTime: users.todayPlayTime,
        lastActive: users.lastActive,
      })
      .from(users)
      .orderBy(desc(users.tokensUsed));

    const { ids: onlineIds } = await getOnlineUsersFromPresence().catch((error) => {
      const err = error as Error;
      const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
      console.error(
        `\x1b[31m[api/admin/dashboard-data] Redis presence failed\x1b[0m`,
        { message: err?.message, cause, stack: err?.stack, error }
      );
      return { ids: [], count: 0 };
    });

    const latestFeedbackRows = await db
      .select({
        userId: feedbacks.userId,
        content: feedbacks.content,
        createdAt: feedbacks.createdAt,
      })
      .from(feedbacks)
      .orderBy(desc(feedbacks.createdAt));

  const latestFeedbackMap = new Map<
    string,
    { content: string; createdAt: Date | null }
  >();
  for (const item of latestFeedbackRows) {
    if (latestFeedbackMap.has(item.userId)) continue;
    latestFeedbackMap.set(item.userId, {
      content: item.content,
      createdAt: item.createdAt,
    });
  }

  const onlineIdSet = new Set(onlineIds);

  const sortedRows = rows
    .map((user) => {
      const latest = latestFeedbackMap.get(user.id);
      return {
        ...user,
        lastActive:
          user.lastActive instanceof Date
            ? user.lastActive.toISOString()
            : String(user.lastActive),
        isOnline: onlineIdSet.has(user.id) ? 1 : 0,
        feedbackPreview: latest ? latest.content.slice(0, 6) : "",
        feedbackContent: latest?.content ?? "",
        feedbackCreatedAt: latest?.createdAt
          ? new Date(latest.createdAt).toISOString()
          : null,
      };
    })
    .sort((a, b) => {
      const aToken = Number(a.tokensUsed) ?? 0;
      const bToken = Number(b.tokensUsed) ?? 0;
      if (bToken !== aToken) return bToken - aToken;
      if (b.isOnline !== a.isOnline) return b.isOnline - a.isOnline;
      const aTime = Number(a.playTime) ?? 0;
      const bTime = Number(b.playTime) ?? 0;
      return bTime - aTime;
    });

  const onlineCount = sortedRows.filter((u) => u.isOnline === 1).length;
  const totalUsers = sortedRows.length;
  const totalTokens = sortedRows.reduce(
    (sum, u) => sum + Number(u.tokensUsed ?? 0),
    0
  );

  const chartData = await getAdminChartData(14);

    return NextResponse.json({
      rows: sortedRows,
      onlineCount,
      totalUsers,
      totalTokens,
      chartData,
    });
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/admin/dashboard-data] handler failed\x1b[0m`,
      { message: err?.message, cause, stack: err?.stack, error }
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

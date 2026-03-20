import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getAdminChartData } from "@/lib/adminDailyMetrics";

export const dynamic = "force-dynamic";

type ChartPoint = { date: string; users: number; tokens: number; activeUsers: number };

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [agg] = await db
    .select({
      totalUsers: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`COALESCE(SUM(${users.tokensUsed}), 0)`,
    })
    .from(users);

  const totalUsers = Number(agg?.totalUsers ?? 0);
  const totalTokens = Number(agg?.totalTokens ?? 0);
  const chartData = (await getAdminChartData(14)) as ChartPoint[];

  return NextResponse.json({
    totalUsers,
    totalTokens,
    chartData,
  });
}

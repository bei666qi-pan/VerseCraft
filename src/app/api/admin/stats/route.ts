import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminStatsSnapshots, users } from "@/db/schema";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";

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

  const today = new Date().toISOString().slice(0, 10);
  const [dauRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(sql`DATE(${users.lastActive}) = ${today}`);
  const activeUsersToday = Number(dauRow?.count ?? 0);

  let chartData: ChartPoint[] = [
    { date: today, users: totalUsers, tokens: totalTokens, activeUsers: activeUsersToday },
  ];

  try {
    await db
      .insert(adminStatsSnapshots)
      .values({
        date: today,
        totalUsers,
        totalTokens,
        activeUsers: activeUsersToday,
      })
      .onConflictDoUpdate({
        target: adminStatsSnapshots.date,
        set: {
          totalUsers,
          totalTokens,
          activeUsers: activeUsersToday,
        },
      });

    const snapshots = await db
      .select({
        date: adminStatsSnapshots.date,
        totalUsers: adminStatsSnapshots.totalUsers,
        totalTokens: adminStatsSnapshots.totalTokens,
        activeUsers: adminStatsSnapshots.activeUsers,
      })
      .from(adminStatsSnapshots)
      .orderBy(asc(adminStatsSnapshots.date));

    chartData = snapshots.map((s) => ({
      date: String(s.date),
      users: Number(s.totalUsers ?? 0),
      tokens: Number(s.totalTokens ?? 0),
      activeUsers: Number(s.activeUsers ?? 0),
    }));
  } catch {
    // Table may not exist yet; use current snapshot only
  }

  return NextResponse.json({
    totalUsers,
    totalTokens,
    chartData,
  });
}

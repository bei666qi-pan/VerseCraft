import os from "node:os";
import { cookies } from "next/headers";
import { asc, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminStatsSnapshots, feedbacks, users } from "@/db/schema";
import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getOnlineUsersFromPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ServerMetrics = {
  cpuLoadPercent: number;
  memoryUsagePercent: number;
  onlineCapacityEstimate: number;
};

function getServerMetrics(): ServerMetrics {
  const cpus = os.cpus();
  const totalTicks = cpus.reduce(
    (sum, cpu) =>
      sum +
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle,
    0
  );
  const idleTicks = cpus.reduce((sum, cpu) => sum + cpu.times.idle, 0);
  const busyRatio = totalTicks > 0 ? 1 - idleTicks / totalTicks : 0;

  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const memoryUsagePercent = totalMem > 0 ? (usedMem / totalMem) * 100 : 0;
  const onlineCapacityEstimate = Math.floor(freeMem / (15 * 1024 * 1024));

  return {
    cpuLoadPercent: Math.max(0, Math.min(100, busyRatio * 100)),
    memoryUsagePercent: Math.max(0, Math.min(100, memoryUsagePercent)),
    onlineCapacityEstimate,
  };
}

export default async function ShadowAdminPage() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  const hasAccess = verifyAdminShadowSession(shadowCookie);

  if (!hasAccess) {
    return <AdminShadowGate />;
  }

  const metrics = getServerMetrics();
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
    .orderBy(desc(users.lastActive));

  const { ids: onlineIds, count: onlineCountFromPresence } =
    await getOnlineUsersFromPresence();

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
        isOnline: onlineIdSet.has(user.id) ? 1 : 0,
        feedbackPreview: latest ? latest.content.slice(0, 6) : "",
        feedbackContent: latest?.content ?? "",
        feedbackCreatedAt: latest?.createdAt ? new Date(latest.createdAt).toISOString() : null,
      };
    })
    .sort((a, b) => {
      if (b.isOnline !== a.isOnline) return b.isOnline - a.isOnline;
      const aTime = Number(a.playTime) ?? 0;
      const bTime = Number(b.playTime) ?? 0;
      return bTime - aTime;
    });

  const onlineCount =
    onlineCountFromPresence > 0
      ? onlineCountFromPresence
      : sortedRows.filter((user) => user.isOnline === 1).length;
  const totalUsers = sortedRows.length;
  const totalTokens = sortedRows.reduce((sum, u) => sum + Number(u.tokensUsed ?? 0), 0);

  const today = new Date().toISOString().slice(0, 10);
  let chartData: { date: string; users: number; tokens: number; activeUsers: number }[] = [
    { date: today, users: totalUsers, tokens: totalTokens, activeUsers: 0 },
  ];
  try {
    const [dauRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`DATE(${users.lastActive}) = ${today}`);
    const activeUsersToday = Number(dauRow?.count ?? 0);
    chartData[0]!.activeUsers = activeUsersToday;

    await db
      .insert(adminStatsSnapshots)
      .values({ date: today, totalUsers, totalTokens, activeUsers: activeUsersToday })
      .onDuplicateKeyUpdate({ set: { totalUsers, totalTokens, activeUsers: activeUsersToday } });

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
    chartData[0]!.activeUsers = sortedRows.filter((u) => {
      const la = u.lastActive instanceof Date ? u.lastActive : new Date(String(u.lastActive));
      return la.toISOString().slice(0, 10) === today;
    }).length;
  }

  return (
    <AdminDashboardClient
      metrics={metrics}
      rows={sortedRows}
      onlineCount={onlineCount}
      totalUsers={totalUsers}
      totalTokens={totalTokens}
      chartData={chartData}
    />
  );
}

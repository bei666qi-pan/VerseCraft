import os from "node:os";
import { cookies } from "next/headers";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";

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
      isOnline: sql<number>`IF(TIMESTAMPDIFF(SECOND, ${users.lastActive}, NOW()) < 120, 1, 0)`,
    })
    .from(users)
    .orderBy(desc(users.lastActive));

  const onlineCount = rows.filter((user) => user.isOnline === 1).length;

  return (
    <AdminDashboardClient
      metrics={metrics}
      rows={rows}
      onlineCount={onlineCount}
    />
  );
}

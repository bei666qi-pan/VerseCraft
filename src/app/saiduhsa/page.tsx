import os from "node:os";
import { cookies } from "next/headers";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
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

function formatPlayTime(totalSeconds: number): string {
  const sec = Number.isFinite(totalSeconds) ? Math.max(0, Math.trunc(totalSeconds)) : 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}小时${minutes}分`;
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
      playTime: users.playTime,
      isOnline: sql<number>`IF(TIMESTAMPDIFF(SECOND, ${users.lastActive}, NOW()) < 120, 1, 0)`,
    })
    .from(users)
    .orderBy(desc(users.lastActive));

  const onlineCount = rows.filter((user) => user.isOnline === 1).length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-black p-8 text-slate-200">
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />
      <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />
      <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-purple-900/20 blur-[150px]" />

      <section className="relative z-10 mx-auto max-w-7xl">
        <h1 className="text-2xl font-semibold tracking-[0.16em] text-slate-100">Ethereal Overseer</h1>
        <p className="mt-2 text-sm text-slate-400">Shadow route telemetry and server observability</p>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 shadow-[0_0_30px_rgba(139,92,246,0.18)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">CPU Load</p>
            <p className="mt-3 text-3xl font-semibold text-slate-100">{metrics.cpuLoadPercent.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 shadow-[0_0_30px_rgba(59,130,246,0.18)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Memory Usage</p>
            <p className="mt-3 text-3xl font-semibold text-slate-100">{metrics.memoryUsagePercent.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-5 shadow-[0_0_30px_rgba(16,185,129,0.18)] backdrop-blur-xl">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Online / Capacity</p>
            <p className="mt-3 text-3xl font-semibold text-slate-100">
              {onlineCount} / {metrics.onlineCapacityEstimate}
            </p>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-white/10 text-slate-400">
              <tr>
                <th className="px-5 py-4 font-medium">账号名</th>
                <th className="px-5 py-4 font-medium">留存时长</th>
                <th className="px-5 py-4 font-medium">消耗 Token</th>
                <th className="px-5 py-4 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => {
                const active = user.isOnline === 1;
                return (
                  <tr key={user.id} className="border-b border-white/5">
                    <td className="px-5 py-4 text-slate-100">{user.name}</td>
                    <td className="px-5 py-4 text-slate-300">{formatPlayTime(user.playTime)}</td>
                    <td className="px-5 py-4 text-slate-300">{user.tokensUsed}</td>
                    <td className="px-5 py-4">
                      {active ? (
                        <span className="inline-flex items-center gap-2 text-emerald-300">
                          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.9)]" />
                          在线 (Online)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-slate-500">
                          <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
                          离线 (Offline)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

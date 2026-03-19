import { cookies } from "next/headers";
import { asc, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminStatsSnapshots, feedbacks, users } from "@/db/schema";
import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
import AdminDashboardClient from "@/components/admin/AdminDashboardClient";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getOnlineUsersFromPresence } from "@/lib/presence";
import { ensureRuntimeSchema } from "@/db/ensureSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShadowAdminPage() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  const hasAccess = verifyAdminShadowSession(shadowCookie);

  if (!hasAccess) {
    if (shadowCookie) {
      cookieStore.delete({ name: ADMIN_SHADOW_COOKIE, path: "/saiduhsa" });
    }
    return <AdminShadowGate />;
  }

  try {
    // Safety net for first boot / missing migrations in production.
    await ensureRuntimeSchema();

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

    const { ids: onlineIds } = await getOnlineUsersFromPresence().catch(() => ({ ids: [], count: 0 }));

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

  const ONLINE_CUTOFF_MS = 5 * 60_000;
  const nowMs = Date.now();
  const onlineIdSet = new Set(onlineIds);
  for (const u of rows) {
    const la = u.lastActive instanceof Date ? u.lastActive : new Date(String(u.lastActive));
    if (nowMs - la.getTime() < ONLINE_CUTOFF_MS) onlineIdSet.add(u.id);
  }

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
      const aToken = Number(a.tokensUsed) ?? 0;
      const bToken = Number(b.tokensUsed) ?? 0;
      if (bToken !== aToken) return bToken - aToken;
      if (b.isOnline !== a.isOnline) return b.isOnline - a.isOnline;
      const aTime = Number(a.playTime) ?? 0;
      const bTime = Number(b.playTime) ?? 0;
      return bTime - aTime;
    });

  const onlineCount = sortedRows.filter((user) => user.isOnline === 1).length;
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
      .onConflictDoUpdate({
        target: adminStatsSnapshots.date,
        set: { totalUsers, totalTokens, activeUsers: activeUsersToday },
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
    chartData[0]!.activeUsers = sortedRows.filter((u) => {
      const la = u.lastActive instanceof Date ? u.lastActive : new Date(String(u.lastActive));
      return la.toISOString().slice(0, 10) === today;
    }).length;
  }

    return (
      <AdminDashboardClient
        rows={sortedRows}
        onlineCount={onlineCount}
        totalUsers={totalUsers}
        totalTokens={totalTokens}
        chartData={chartData}
      />
    );
  } catch (error) {
    const err = error as any;
    // Print a guaranteed-visible line first (DevTools/Overlay may show `{}` for objects).
    const errText = (() => {
      try {
        return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      } catch {
        return "Unknown error";
      }
    })();
    // In dev, Next overlay treats console.error as a server error surface.
    // Use warn so local env misconfig (DB down/missing) won't look like an app crash.
    console.warn(`[saiduhsa] admin page render failed: ${errText}`);
    console.warn("[saiduhsa] admin page render failed detail", {
      text: errText,
      name: err?.name,
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      hint: err?.hint,
      cause: err?.cause,
      stack: err?.stack,
    });

    // Avoid falling into the global error boundary (which misleadingly suggests clearing browser cache).
    // Show a deterministic server-side fallback UI instead.
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black p-8 text-slate-200">
        <div className="w-full max-w-xl rounded-3xl bg-white/5 p-8 shadow-[0_0_40px_rgba(168,85,247,0.2)] backdrop-blur-2xl">
          <h1 className="text-lg font-semibold tracking-[0.2em] text-slate-100">控制台暂不可用</h1>
          <p className="mt-3 text-sm text-slate-400">
            后台数据源暂时不可用（通常是数据库/缓存服务波动）。请稍后刷新重试。
          </p>
          <p className="mt-2 text-xs text-slate-500 break-words">
            {errText ? `错误信息：${errText}` : "错误信息：未知"}
          </p>
          {typeof err?.code === "string" || typeof err?.detail === "string" ? (
            <p className="mt-2 text-xs text-slate-500 break-words">
              {typeof err?.code === "string" ? `错误代码：${err.code}` : null}
              {typeof err?.code === "string" && typeof err?.detail === "string" ? " / " : null}
              {typeof err?.detail === "string" ? `详情：${err.detail}` : null}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="/saiduhsa"
              className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium transition hover:bg-white/20"
            >
              刷新重试
            </a>
            <form
              action={async () => {
                "use server";
                const store = await cookies();
                store.delete({ name: ADMIN_SHADOW_COOKIE, path: "/saiduhsa" });
              }}
            >
              <button
                type="submit"
                className="rounded-xl bg-rose-500/15 px-5 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/25"
              >
                退出后台登录
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }
}

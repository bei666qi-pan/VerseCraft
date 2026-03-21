import { cookies } from "next/headers";
import { AdminShadowGate } from "@/components/admin/AdminShadowGate";
import AdminDashboardV2 from "@/components/admin/AdminDashboardV2";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { ensureRuntimeSchema } from "@/db/ensureSchema";
import { getDashboardTableData } from "@/lib/admin/service";
import { getAdminChartData } from "@/lib/adminDailyMetrics";
import { unwrapPageDynamicOnServer, type AppPageDynamicProps } from "@/lib/next/pageDynamicProps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShadowAdminPage(props: AppPageDynamicProps) {
  await unwrapPageDynamicOnServer(props);
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  const hasAccess = verifyAdminShadowSession(shadowCookie);

  if (!hasAccess) {
    if (shadowCookie) {
      cookieStore.delete({ name: ADMIN_SHADOW_COOKIE, path: "/" });
      cookieStore.delete({ name: ADMIN_SHADOW_COOKIE, path: "/saiduhsa" });
    }
    return <AdminShadowGate />;
  }

  try {
    // Safety net for first boot / missing migrations in production.
    await ensureRuntimeSchema();
    const base = await getDashboardTableData();
    const chartData = await getAdminChartData(14);

    return (
      <AdminDashboardV2
        rows={base.rows}
        onlineCount={base.onlineCount}
        totalUsers={base.totalUsers}
        totalTokens={base.totalTokens}
        chartData={chartData}
      />
    );
  } catch (error) {
    const err = error as Record<string, unknown> | null;
    // Print a guaranteed-visible line first (DevTools/Overlay may show `{}` for objects).
    const errText = (() => {
      try {
        if (error instanceof Error) return `${error.name}: ${error.message}`;
        return String(error);
      } catch {
        return "Unknown error";
      }
    })();
    // In dev, Next overlay treats console.error as a server error surface.
    // Use warn so local env misconfig (DB down/missing) won't look like an app crash.
    console.warn(`[saiduhsa] admin page render failed: ${errText}`);
    console.warn("[saiduhsa] admin page render failed detail", {
      text: errText,
      name: typeof err?.name === "string" ? err.name : undefined,
      message: typeof err?.message === "string" ? err.message : undefined,
      code: typeof err?.code === "string" ? err.code : undefined,
      detail: typeof err?.detail === "string" ? err.detail : undefined,
      hint: typeof err?.hint === "string" ? err.hint : undefined,
      cause: err?.cause,
      stack: typeof err?.stack === "string" ? err.stack : undefined,
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
                store.delete({ name: ADMIN_SHADOW_COOKIE, path: "/" });
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

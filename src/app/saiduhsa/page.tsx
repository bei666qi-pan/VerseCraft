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

  let rows: Awaited<ReturnType<typeof getDashboardTableData>>["rows"] = [];
  let onlineCount = 0;
  let totalUsers = 0;
  let totalTokens = 0;
  let chartData: Awaited<ReturnType<typeof getAdminChartData>> = [];

  try {
    await ensureRuntimeSchema();
  } catch (e) {
    console.warn("[saiduhsa] ensureRuntimeSchema best-effort failed", e);
  }

  const results = await Promise.allSettled([getDashboardTableData(), getAdminChartData(14)]);
  if (results[0].status === "fulfilled") {
    const b = results[0].value;
    rows = b.rows;
    onlineCount = b.onlineCount;
    totalUsers = b.totalUsers;
    totalTokens = b.totalTokens;
  } else {
    console.warn("[saiduhsa] getDashboardTableData failed, client will refetch", results[0].reason);
  }
  if (results[1].status === "fulfilled") {
    chartData = results[1].value;
  } else {
    console.warn("[saiduhsa] getAdminChartData failed, client will refetch", results[1].reason);
  }

  return (
    <AdminDashboardV2
      rows={rows}
      onlineCount={onlineCount}
      totalUsers={totalUsers}
      totalTokens={totalTokens}
      chartData={chartData}
    />
  );
}

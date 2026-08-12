import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { getDashboardTableData } from "@/lib/admin/service";
import { getAdminChartData } from "@/lib/adminDailyMetrics";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async () => {
  const base = await getDashboardTableData();
  const chartData = await getAdminChartData(14);
  return { ...base, chartData };
}, { label: "dashboard-data", cacheSeconds: 10, staleWhileRevalidate: 20, errorReason: "dashboard_data_unavailable" });

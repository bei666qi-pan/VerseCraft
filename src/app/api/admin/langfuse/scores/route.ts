import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getScoreStats } from "@/lib/observability/langfuse/queryClient";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get("range") ?? "7d";
    const rangeDays = rangeParam === "30d" ? 30 : rangeParam === "1d" ? 1 : 7;
    const name = url.searchParams.get("name") ?? undefined;

    const result = await getScoreStats({ name, rangeDays });

    if (result.degraded && !result.data.length) {
      return adminJson(adminFail(result.reason ?? "langfuse_unavailable", { stats: [] }), {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
      });
    }

    return adminJson(adminOk({ stats: result.data }, { degraded: result.degraded, reason: result.reason }), {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[api/admin/langfuse/scores] failed", error);
    return adminJson(adminFail("langfuse_unavailable", { stats: [] }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

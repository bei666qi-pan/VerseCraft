import { adminFail, adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { buildEmptyEventHealthMetrics, getEventHealthMetrics } from "@/lib/admin/eventHealthMetrics";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : 20;
}

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  const limit = parseLimit(url.searchParams.get("limit"));
  try {
    const data = await getEventHealthMetrics(range, { limit });
    const degraded = data.evidenceSufficiency === "insufficient";
    return adminJson(adminOk(data, { degraded, reason: degraded ? "insufficient_sample" : null }), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/admin/event-health] failed", error);
    return adminJson(adminFail("event_health_unavailable", buildEmptyEventHealthMetrics(range)), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=10" },
    });
  }
}

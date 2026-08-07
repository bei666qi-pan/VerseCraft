import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listTraces } from "@/lib/observability/langfuse/queryClient";
import type { ListTracesParams } from "@/lib/observability/langfuse/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(req.url);
    const params: ListTracesParams = {
      q: url.searchParams.get("q") ?? undefined,
      model: url.searchParams.get("model") ?? undefined,
      lane: url.searchParams.get("lane") ?? undefined,
      fromTimestamp: url.searchParams.get("from") ?? undefined,
      toTimestamp: url.searchParams.get("to") ?? undefined,
      page: url.searchParams.get("page") ? parseInt(url.searchParams.get("page")!, 10) : 1,
      limit: url.searchParams.get("limit") ? parseInt(url.searchParams.get("limit")!, 10) : 20,
    };

    const result = await listTraces(params);
    if (result.degraded && !result.data.traces.length) {
      return adminJson(adminFail(result.reason ?? "langfuse_unavailable", result.data), {
        headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
      });
    }

    return adminJson(adminOk(result.data, { degraded: result.degraded, reason: result.reason }), {
      headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("[api/admin/langfuse/traces] failed", error);
    return adminJson(adminFail("langfuse_unavailable", { traces: [], total: 0, page: 1, limit: 20 }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

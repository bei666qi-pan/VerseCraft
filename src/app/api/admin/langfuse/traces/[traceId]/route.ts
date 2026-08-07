import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getTrace } from "@/lib/observability/langfuse/queryClient";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ traceId: string }> },
) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { traceId } = await params;

  try {
    const result = await getTrace(traceId);
    if (!result.data) {
      return adminJson(adminFail(result.reason ?? "trace_not_found", null), {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
      });
    }

    return adminJson(adminOk(result.data, { degraded: result.degraded, reason: result.reason }), {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[api/admin/langfuse/traces/[traceId]] failed", error);
    return adminJson(adminFail("langfuse_unavailable", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

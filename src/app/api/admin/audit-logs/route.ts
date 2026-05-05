import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listAdminAuditLogs } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  try {
    const data = await listAdminAuditLogs({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 30,
      cursor: url.searchParams.get("cursor"),
    });
    return adminJson(adminOk(data), { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" } });
  } catch (error) {
    console.error("[api/admin/audit-logs] failed", error);
    const reason = "audit_logs_unavailable";
    return adminJson(adminFail(reason, { rows: [], nextCursor: null, hasMore: false }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

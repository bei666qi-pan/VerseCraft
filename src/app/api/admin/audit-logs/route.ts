import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { listAdminAuditLogs } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

export const GET = createAdminRoute(async (ctx) => {
  const sp = new URL(ctx.req.url).searchParams;
  const data = await listAdminAuditLogs({
    limit: sp.get("limit") ? Number(sp.get("limit")) : 30,
    cursor: sp.get("cursor"),
  });
  return data;
}, {
  label: "audit-logs",
  cacheSeconds: 10,
  staleWhileRevalidate: 15,
  onError: () => ({
    reason: "audit_logs_unavailable",
    fallback: { rows: [], nextCursor: null, hasMore: false },
    cacheSeconds: 5,
  }),
});

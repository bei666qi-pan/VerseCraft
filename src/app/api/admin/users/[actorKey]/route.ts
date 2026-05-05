import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getAdminUserDetail } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ actorKey: string }> }) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { actorKey } = await ctx.params;
  try {
    const data = await getAdminUserDetail(decodeURIComponent(actorKey));
    if (!data) return adminJson(adminFail<null>("actor_not_found", null), { status: 404 });
    return adminJson(adminOk(data), { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" } });
  } catch (error) {
    console.error("[api/admin/users/[actorKey]] failed", error);
    const reason = "user_detail_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=5" } });
  }
}

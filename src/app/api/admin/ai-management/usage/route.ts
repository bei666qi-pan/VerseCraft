import { adminFail, adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { friendlyAiManagementReason } from "@/lib/admin/aiManagementApi";
import { queryAiUsage } from "@/lib/admin/aiManagementRepository";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req); if (!guard.ok) return guard.response;
  const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
  try { return adminJson(adminOk(await queryAiUsage(days)), { headers: { "Cache-Control": "private, max-age=5" } }); }
  catch (error) { return adminJson(adminFail(friendlyAiManagementReason(error), null)); }
}

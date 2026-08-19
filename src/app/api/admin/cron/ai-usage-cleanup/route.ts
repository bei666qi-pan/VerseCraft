import { adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminCronRequest } from "@/lib/admin/authGuard";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { rollupAndCleanupManagedUsage } from "@/lib/ai/managed/usageRepository";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const guard = await verifyAdminCronRequest(req); if (!guard.ok) return guard.response;
  const result = await rollupAndCleanupManagedUsage();
  await recordAdminAuditLog({ action: "admin_cron_ai_usage_cleanup", actor: guard.actor, success: true, metadata: result });
  return adminJson(adminOk(result));
}

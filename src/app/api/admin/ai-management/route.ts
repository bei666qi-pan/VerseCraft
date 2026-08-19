import { adminFail, adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { friendlyAiManagementReason, guardAiMutation } from "@/lib/admin/aiManagementApi";
import { getAiManagementData, saveAiService, type AdminAiServiceInput } from "@/lib/admin/aiManagementRepository";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req); if (!guard.ok) return guard.response;
  try { return adminJson(adminOk(await getAiManagementData()), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminJson(adminFail(friendlyAiManagementReason(error), null)); }
}

export async function POST(req: Request) {
  const guard = await guardAiMutation(req); if (!guard.ok) return guard.response;
  let input: AdminAiServiceInput;
  try { input = await req.json() as AdminAiServiceInput; } catch { return adminJson(adminFail("提交内容无法识别。", null), { status: 400 }); }
  try {
    const result = await saveAiService(input);
    await recordAdminAuditLog({ action: input.id ? "admin_ai_service_update" : "admin_ai_service_create", actor: guard.actor, success: true, targetType: "ai_service", targetId: result.service.id, metadata: { modelIds: result.service.models.map((m) => m.id) } });
    return adminJson(adminOk(result));
  } catch (error) {
    await recordAdminAuditLog({ action: input.id ? "admin_ai_service_update" : "admin_ai_service_create", actor: guard.actor, success: false, targetType: "ai_service", targetId: input.id ?? null, reason: "validation_or_probe_failed" });
    return adminJson(adminFail(friendlyAiManagementReason(error), null), { status: 400 });
  }
}


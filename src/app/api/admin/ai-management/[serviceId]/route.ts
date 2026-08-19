import { adminFail, adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { friendlyAiManagementReason, guardAiMutation } from "@/lib/admin/aiManagementApi";
import { setAiServiceEnabled, softDeleteAiService, testAiService } from "@/lib/admin/aiManagementRepository";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ serviceId: string }> };

export async function PATCH(req: Request, context: Params) {
  const guard = await guardAiMutation(req); if (!guard.ok) return guard.response;
  const { serviceId } = await context.params;
  const body = await req.json().catch(() => ({})) as { action?: string; enabled?: boolean };
  try {
    if (body.action === "test") await testAiService(serviceId); else await setAiServiceEnabled(serviceId, body.enabled === true);
    await recordAdminAuditLog({ action: body.action === "test" ? "admin_ai_service_test" : "admin_ai_service_toggle", actor: guard.actor, success: true, targetType: "ai_service", targetId: serviceId, metadata: body.action === "test" ? {} : { enabled: body.enabled === true } });
    return adminJson(adminOk({ id: serviceId, ok: true }));
  } catch (error) {
    await recordAdminAuditLog({ action: body.action === "test" ? "admin_ai_service_test" : "admin_ai_service_toggle", actor: guard.actor, success: false, targetType: "ai_service", targetId: serviceId, reason: "operation_failed" });
    return adminJson(adminFail(friendlyAiManagementReason(error), null), { status: 400 });
  }
}

export async function DELETE(req: Request, context: Params) {
  const guard = await guardAiMutation(req); if (!guard.ok) return guard.response;
  const { serviceId } = await context.params;
  try {
    await softDeleteAiService(serviceId);
    await recordAdminAuditLog({ action: "admin_ai_service_delete", actor: guard.actor, success: true, targetType: "ai_service", targetId: serviceId });
    return adminJson(adminOk({ id: serviceId, ok: true }));
  } catch (error) {
    await recordAdminAuditLog({ action: "admin_ai_service_delete", actor: guard.actor, success: false, targetType: "ai_service", targetId: serviceId, reason: "operation_failed" });
    return adminJson(adminFail(friendlyAiManagementReason(error), null), { status: 400 });
  }
}


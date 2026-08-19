import { adminFail, adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { friendlyAiManagementReason, guardAiMutation } from "@/lib/admin/aiManagementApi";
import { replaceAiRoutes } from "@/lib/admin/aiManagementRepository";

export const dynamic = "force-dynamic";
export async function PUT(req: Request) {
  const guard = await guardAiMutation(req); if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return adminJson(adminFail("提交内容无法识别。", null), { status: 400 });
  try {
    await replaceAiRoutes(body);
    await recordAdminAuditLog({ action: "admin_ai_routes_update", actor: guard.actor, success: true, targetType: "ai_routes", targetId: "all" });
    return adminJson(adminOk({ ok: true }));
  } catch (error) {
    await recordAdminAuditLog({ action: "admin_ai_routes_update", actor: guard.actor, success: false, targetType: "ai_routes", targetId: "all", reason: "operation_failed" });
    return adminJson(adminFail(friendlyAiManagementReason(error), null), { status: 400 });
  }
}


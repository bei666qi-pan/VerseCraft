import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listWorldKnowledgeEntities } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  try {
    const rows = await listWorldKnowledgeEntities({
      scope: url.searchParams.get("scope") ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    return adminJson(adminOk({ rows }), { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/entities] failed", error);
    return adminJson(adminFail<null>("world_knowledge_entities_unavailable", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

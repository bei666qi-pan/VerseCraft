import { cookies } from "next/headers";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getWorldKnowledgeEntityDetail } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }
  const { id } = await ctx.params;
  const entityId = Number(id);
  if (!Number.isFinite(entityId) || entityId <= 0) {
    return adminJson(adminFail<null>("invalid_entity_id", null), { status: 400 });
  }
  try {
    const detail = await getWorldKnowledgeEntityDetail(entityId);
    if (!detail) return adminJson(adminFail<null>("not_found", null), { status: 404 });
    return adminJson(adminOk(detail), { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/entities/:id] failed", error);
    return adminJson(adminFail<null>("world_knowledge_entity_detail_unavailable", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

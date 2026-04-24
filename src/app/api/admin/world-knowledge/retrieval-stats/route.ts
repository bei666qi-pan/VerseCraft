import { cookies } from "next/headers";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getWorldKnowledgeRetrievalStats } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }
  try {
    const data = await getWorldKnowledgeRetrievalStats();
    return adminJson(adminOk(data), { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/retrieval-stats] failed", error);
    return adminJson(adminFail<null>("world_knowledge_retrieval_stats_unavailable", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

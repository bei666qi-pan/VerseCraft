import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getWorldKnowledgeRetrievalStats } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await verifyAdminRequest();
  if (!guard.ok) return guard.response;
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

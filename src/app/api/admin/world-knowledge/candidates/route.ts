import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listWorldKnowledgeCandidates } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  try {
    const rows = await listWorldKnowledgeCandidates({
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    return adminJson(adminOk({ rows }), { headers: { "Cache-Control": "private, max-age=8, stale-while-revalidate=12" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/candidates] failed", error);
    return adminJson(adminFail<null>("world_knowledge_candidates_unavailable", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

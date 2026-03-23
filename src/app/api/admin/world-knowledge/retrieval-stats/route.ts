import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getWorldKnowledgeRetrievalStats } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  try {
    const data = await getWorldKnowledgeRetrievalStats();
    return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/retrieval-stats] failed", error);
    return NextResponse.json({ error: "world_knowledge_retrieval_stats_unavailable", degraded: true }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getWorldKnowledgeEntityDetail } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const entityId = Number(id);
  if (!Number.isFinite(entityId) || entityId <= 0) {
    return NextResponse.json({ error: "invalid_entity_id" }, { status: 400 });
  }
  try {
    const detail = await getWorldKnowledgeEntityDetail(entityId);
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail, { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/entities/:id] failed", error);
    return NextResponse.json({ error: "world_knowledge_entity_detail_unavailable", degraded: true }, { status: 500 });
  }
}

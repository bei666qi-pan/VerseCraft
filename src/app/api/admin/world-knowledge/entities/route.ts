import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { listWorldKnowledgeEntities } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
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
    return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" } });
  } catch (error) {
    console.error("[api/admin/world-knowledge/entities] failed", error);
    return NextResponse.json({ error: "world_knowledge_entities_unavailable", degraded: true }, { status: 500 });
  }
}

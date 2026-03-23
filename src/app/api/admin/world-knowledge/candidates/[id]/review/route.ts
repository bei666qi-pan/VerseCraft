import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { reviewWorldKnowledgeCandidate } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | {
        source?: "world_player_facts" | "vc_world_candidate";
        decision?: "allow_shared" | "reject" | "private_only";
      }
    | null;
  if (!body?.source || !body?.decision) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  try {
    const updated = await reviewWorldKnowledgeCandidate({
      candidateId: id,
      source: body.source,
      decision: body.decision,
    });
    if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    console.error("[api/admin/world-knowledge/candidates/:id/review] failed", error);
    return NextResponse.json({ error: "world_knowledge_review_failed" }, { status: 500 });
  }
}

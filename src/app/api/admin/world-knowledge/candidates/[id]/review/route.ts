import { cookies } from "next/headers";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { reviewWorldKnowledgeCandidate } from "@/lib/admin/worldKnowledgeService";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | {
        source?: "world_player_facts" | "vc_world_candidate";
        decision?: "allow_shared" | "reject" | "private_only";
      }
    | null;
  if (!body?.source || !body?.decision) {
    return adminJson(adminFail<null>("invalid_payload", null), { status: 400 });
  }
  try {
    const updated = await reviewWorldKnowledgeCandidate({
      candidateId: id,
      source: body.source,
      decision: body.decision,
    });
    if (!updated) return adminJson(adminFail<null>("not_found", null), { status: 404 });
    return adminJson(adminOk({ updated }));
  } catch (error) {
    console.error("[api/admin/world-knowledge/candidates/:id/review] failed", error);
    return adminJson(adminFail<null>("world_knowledge_review_failed", null), { status: 200 });
  }
}

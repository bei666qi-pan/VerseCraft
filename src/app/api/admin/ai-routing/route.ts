// src/app/api/admin/ai-routing/route.ts
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { listRecentAiObservability } from "@/lib/ai/debug/observabilityRing";
import { listRecentAiRoutingReports } from "@/lib/ai/debug/routingRing";
import { snapshotModelCircuits } from "@/lib/ai/fallback/modelCircuit";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

  try {
    return adminJson(
      adminOk({
        recent: listRecentAiRoutingReports(),
        observability: listRecentAiObservability(),
        modelCircuits: snapshotModelCircuits(),
      }),
      { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" } }
    );
  } catch (e) {
    const reason = e instanceof Error ? e.message : "ai_routing_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200 });
  }
}

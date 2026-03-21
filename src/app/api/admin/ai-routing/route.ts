// src/app/api/admin/ai-routing/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { listRecentAiObservability } from "@/lib/ai/debug/observabilityRing";
import { listRecentAiRoutingReports } from "@/lib/ai/debug/routingRing";
import { snapshotModelCircuits } from "@/lib/ai/fallback/modelCircuit";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    recent: listRecentAiRoutingReports(),
    observability: listRecentAiObservability(),
    modelCircuits: snapshotModelCircuits(),
  });
}

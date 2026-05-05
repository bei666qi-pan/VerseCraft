// src/app/api/admin/ai-routing/route.ts
import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listRecentAiObservability } from "@/lib/ai/debug/observabilityRing";
import { listRecentAiRoutingReports } from "@/lib/ai/debug/routingRing";
import { snapshotModelCircuits } from "@/lib/ai/fallback/modelCircuit";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await verifyAdminRequest();
  if (!guard.ok) return guard.response;

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

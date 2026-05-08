import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getPlayerJourneyMetrics } from "@/lib/admin/backofficeMetrics";
import { parseJourneyFunnelMode } from "@/lib/admin/journeyFunnel";

export const dynamic = "force-dynamic";

function parseActorType(v: string | null): "all" | "registered" | "guest" {
  return v === "registered" || v === "guest" ? v : "all";
}

function parsePlatform(v: string | null): "all" | "pc" | "mobile" {
  return v === "pc" || v === "mobile" ? v : "all";
}

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  const mode = parseJourneyFunnelMode(url.searchParams.get("mode"));
  try {
    const data = await getPlayerJourneyMetrics(range, {
      actorType: parseActorType(url.searchParams.get("actorType")),
      platform: parsePlatform(url.searchParams.get("platform")),
    }, mode);
    return adminJson(adminOk(data, { degraded: data.evidenceSufficiency === "insufficient", reason: data.evidenceSufficiency === "insufficient" ? "insufficient_sample" : null }), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/admin/player-journey] failed", error);
    const reason = "player_journey_unavailable";
    return adminJson(
      adminFail(reason, {
        range,
        filters: { actorType: parseActorType(url.searchParams.get("actorType")), platform: parsePlatform(url.searchParams.get("platform")) },
        mode,
        sampleSize: 0,
        evidenceSufficiency: "insufficient",
        stages: [],
        updatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}

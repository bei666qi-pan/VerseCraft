import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
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

export const GET = createAdminRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  const mode = parseJourneyFunnelMode(url.searchParams.get("mode"));
  const data = await getPlayerJourneyMetrics(range, {
    actorType: parseActorType(url.searchParams.get("actorType")),
    platform: parsePlatform(url.searchParams.get("platform")),
  }, mode);
  const degraded = data.evidenceSufficiency === "insufficient";
  return { data, degraded, reason: degraded ? "insufficient_sample" : null };
}, {
  label: "player-journey",
  cacheSeconds: 60,
  staleWhileRevalidate: 120,
  onError: (_, ctx) => {
    const url = new URL(ctx.req.url);
    const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
    const mode = parseJourneyFunnelMode(url.searchParams.get("mode"));
    return {
      reason: "player_journey_unavailable",
      fallback: {
        range,
        filters: { actorType: parseActorType(url.searchParams.get("actorType")), platform: parsePlatform(url.searchParams.get("platform")) },
        mode,
        sampleSize: 0, evidenceSufficiency: "insufficient", stages: [],
        updatedAt: new Date().toISOString(),
      },
      cacheSeconds: 10,
    };
  },
});

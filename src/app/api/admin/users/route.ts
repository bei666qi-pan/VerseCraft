import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { listAdminUsers } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

function parseActorType(v: string | null): "all" | "registered" | "guest" {
  return v === "registered" || v === "guest" ? v : "all";
}

function parseSort(v: string | null): "tokens" | "lastActive" | "playTime" {
  return v === "tokens" || v === "playTime" ? v : "lastActive";
}

export const GET = createAdminRoute(async (ctx) => {
  const sp = new URL(ctx.req.url).searchParams;
  const data = await listAdminUsers({
    limit: sp.get("limit") ? Number(sp.get("limit")) : 20,
    cursor: sp.get("cursor"),
    search: sp.get("search"),
    onlyOnline: sp.get("onlyOnline") === "1" || sp.get("onlyOnline") === "true",
    actorType: parseActorType(sp.get("actorType")),
    sort: parseSort(sp.get("sort")),
  });
  return data;
}, {
  label: "users",
  cacheSeconds: 10,
  staleWhileRevalidate: 15,
  onError: (_, ctx) => {
    const sp = new URL(ctx.req.url).searchParams;
    return {
      reason: "users_unavailable",
      fallback: { rows: [], nextCursor: null, hasMore: false, totalApprox: 0, limit: sp.get("limit") ? Number(sp.get("limit")) : 20 },
      cacheSeconds: 5,
    };
  },
});

import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listAdminUsers } from "@/lib/admin/backofficeMetrics";

export const dynamic = "force-dynamic";

function parseActorType(v: string | null): "all" | "registered" | "guest" {
  return v === "registered" || v === "guest" ? v : "all";
}

function parseSort(v: string | null): "tokens" | "lastActive" | "playTime" {
  return v === "tokens" || v === "playTime" ? v : "lastActive";
}

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  try {
    const data = await listAdminUsers({
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20,
      cursor: url.searchParams.get("cursor"),
      search: url.searchParams.get("search"),
      onlyOnline: url.searchParams.get("onlyOnline") === "1" || url.searchParams.get("onlyOnline") === "true",
      actorType: parseActorType(url.searchParams.get("actorType")),
      sort: parseSort(url.searchParams.get("sort")),
    });
    return adminJson(adminOk(data), { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=15" } });
  } catch (error) {
    console.error("[api/admin/users] failed", error);
    const reason = "users_unavailable";
    return adminJson(adminFail(reason, { rows: [], nextCursor: null, hasMore: false, totalApprox: 0, limit: 20 }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { rebuildAdminMetricsDailyForDateKey } from "@/lib/analytics/aggregation";
import { adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

function addDaysUtc(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

export async function POST(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get("days") ?? 3) || 3));
  const end = new Date();
  const results: Array<{ dateKey: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < days; i++) {
    const dateKey = getUtcDateKey(addDaysUtc(end, -i));
    try {
      await rebuildAdminMetricsDailyForDateKey(dateKey);
      results.push({ dateKey, ok: true });
    } catch (error) {
      console.error("[api/admin/rebuild-daily] rebuild failed", error);
      results.push({ dateKey, ok: false, error: "rebuild_failed" });
    }
  }

  const success = results.every((r) => r.ok);
  await recordAdminAuditLog({
    action: "admin_manual_rebuild_daily",
    actor: guard.actor,
    success,
    reason: success ? null : "partial_rebuild_failed",
    metadata: { days, failed: results.filter((r) => !r.ok).length },
  });

  return adminJson(
    adminOk(
      {
        ok: success,
        days,
        results,
      },
      { degraded: !success, reason: success ? null : "partial_rebuild_failed" }
    )
  );
}

import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { rebuildAdminMetricsDailyForDateKey } from "@/lib/analytics/aggregation";
import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { clamp } from "@/lib/clamp";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

function addDaysUtc(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

export const POST = createAdminRoute(async (ctx) => {
  const sp = new URL(ctx.req.url).searchParams;
  const days = clamp(Number(sp.get("days") ?? 3) || 3, 1, 30);
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
    actor: ctx.guard,
    success,
    reason: success ? null : "partial_rebuild_failed",
    metadata: { days, failed: results.filter((r) => !r.ok).length },
  });

  return { data: { ok: success, days, results }, degraded: !success, reason: success ? null : "partial_rebuild_failed" };
}, { label: "rebuild-daily" });

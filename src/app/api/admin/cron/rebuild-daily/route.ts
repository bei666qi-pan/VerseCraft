import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { rebuildAdminMetricsDailyForDateKey } from "@/lib/analytics/aggregation";
import { adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminCronRequest } from "@/lib/admin/authGuard";
import { clamp } from "@/lib/clamp";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

function addDaysUtc(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

export async function POST(req: Request) {
  const guard = await verifyAdminCronRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const days = clamp(Number(url.searchParams.get("days") ?? 3) || 3, 1, 30);
  const end = new Date();

  const results: Array<{ dateKey: string; ok: boolean; error?: string }> = [];
  for (let i = 0; i < days; i++) {
    const dateKey = getUtcDateKey(addDaysUtc(end, -i));
    try {
      await rebuildAdminMetricsDailyForDateKey(dateKey);
      results.push({ dateKey, ok: true });
    } catch (error) {
      console.error("[api/admin/cron/rebuild-daily] rebuild failed", error);
      results.push({ dateKey, ok: false, error: "rebuild_failed" });
    }
  }

  await recordAdminAuditLog({
    action: "admin_cron_rebuild_daily",
    actor: guard.actor,
    success: results.every((r) => r.ok),
    reason: results.every((r) => r.ok) ? null : "partial_rebuild_failed",
    metadata: { days, failed: results.filter((r) => !r.ok).length },
  });

  return adminJson(
    adminOk({
      ok: results.every((r) => r.ok),
      days,
      results,
    })
  );
}


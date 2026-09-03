import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminCronRequest } from "@/lib/admin/authGuard";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";

export const dynamic = "force-dynamic";

/**
 * World Director retention only removes terminal data. Parent runs must never
 * cascade-delete pending agenda.
 *
 * Event rows in pending/due/injected keep their parent run alive regardless of age.
 */

function clampDays(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function POST(req: Request) {
  const guard = await verifyAdminCronRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const runsDays = clampDays(url.searchParams.get("runsDays"), 30, 7, 180);
  const queueDays = clampDays(url.searchParams.get("queueDays"), 14, 3, 90);

  const results: Record<string, { ok: boolean; deletedCount?: number; error?: string }> = {};

  try {
    const deleted = await db.execute(sql`
      DELETE FROM world_engine_runs
      WHERE created_at < NOW() - (${runsDays}::text || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM world_engine_event_queue q
          WHERE q.run_id = world_engine_runs.run_id
            AND q.status NOT IN ('resolved', 'expired', 'rejected')
        )
    `);
    results.worldEngineRuns = { ok: true, deletedCount: Number((deleted as { rowCount?: number }).rowCount ?? 0) };
  } catch (error) {
    console.error("[api/admin/cron/world-engine-cleanup] world_engine_runs failed", error);
    results.worldEngineRuns = { ok: false, error: "delete_failed" };
  }

  try {
    const deleted = await db.execute(sql`
      DELETE FROM world_engine_event_queue
      WHERE status IN ('resolved', 'expired')
        AND created_at < NOW() - (${queueDays}::text || ' days')::interval
    `);
    results.worldEngineEventQueue = { ok: true, deletedCount: Number((deleted as { rowCount?: number }).rowCount ?? 0) };
  } catch (error) {
    console.error("[api/admin/cron/world-engine-cleanup] world_engine_event_queue failed", error);
    results.worldEngineEventQueue = { ok: false, error: "delete_failed" };
  }

  const allOk = Object.values(results).every((r) => r.ok);
  await recordAdminAuditLog({
    action: "admin_cron_world_engine_cleanup",
    actor: guard.actor,
    success: allOk,
    reason: allOk ? null : "partial_cleanup_failed",
    metadata: { runsDays, queueDays, results },
  });

  return adminJson(
    adminOk({
      ok: allOk,
      runsDays,
      queueDays,
      results,
    })
  );
}

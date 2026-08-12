import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminJson, adminOk } from "@/lib/admin/apiEnvelope";
import { verifyAdminCronRequest } from "@/lib/admin/authGuard";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";
import { clampDays } from "@/lib/admin/cronSupport";

export const dynamic = "force-dynamic";

/**
 * world_engine_runs / world_engine_event_queue / world_engine_agenda_snapshots 此前没有任何
 * retention/归档机制（后台重构调研发现的风险项）。这三张表的安全清理边界经过代码核查确认：
 *
 * - world_engine_runs.status 实际只会被写成 'succeeded'（engine.ts 里 tick 失败时整个事务
 *   ROLLBACK，不写入任何行），写入后从不被 UPDATE，是终态——按 created_at 做 TTL 全表安全。
 * - world_engine_event_queue.status 是真正的状态机：pending/due/injected 是中间态，后续逻辑
 *   还会读取/更新，绝不能清理；resolved/expired 是终态，可以按 created_at 做 TTL。
 * - world_engine_agenda_snapshots 只有 `SELECT MAX(agenda_revision)` 这一种读取方式（用于自增），
 *   不存在读取历史 revision 内容的代码路径，因此每个 session 只需保留最新一条 revision，
 *   其余的可以清理。
 *
 * 现有 reasoner-health / health 检查的读取窗口最长 24 小时，所以默认保留天数留了远大于此的
 * 安全余量。
 */

export async function POST(req: Request) {
  const guard = await verifyAdminCronRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const runsDays = clampDays(url.searchParams.get("runsDays"), 30, 7, 180);
  const queueDays = clampDays(url.searchParams.get("queueDays"), 14, 3, 90);
  const snapshotsDays = clampDays(url.searchParams.get("snapshotsDays"), 14, 3, 90);

  const results: Record<string, { ok: boolean; deletedCount?: number; error?: string }> = {};

  try {
    const deleted = await db.execute(sql`
      DELETE FROM world_engine_runs
      WHERE created_at < NOW() - (${runsDays}::text || ' days')::interval
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

  try {
    // 每个 session 只保留 MAX(agenda_revision) 那一条（唯一被读取的），其余早于窗口的清理掉。
    const deleted = await db.execute(sql`
      DELETE FROM world_engine_agenda_snapshots s
      WHERE s.created_at < NOW() - (${snapshotsDays}::text || ' days')::interval
        AND s.agenda_revision < (
          SELECT MAX(s2.agenda_revision)
          FROM world_engine_agenda_snapshots s2
          WHERE s2.session_id = s.session_id
        )
    `);
    results.worldEngineAgendaSnapshots = { ok: true, deletedCount: Number((deleted as { rowCount?: number }).rowCount ?? 0) };
  } catch (error) {
    console.error("[api/admin/cron/world-engine-cleanup] world_engine_agenda_snapshots failed", error);
    results.worldEngineAgendaSnapshots = { ok: false, error: "delete_failed" };
  }

  const allOk = Object.values(results).every((r) => r.ok);
  await recordAdminAuditLog({
    action: "admin_cron_world_engine_cleanup",
    actor: guard.actor,
    success: allOk,
    reason: allOk ? null : "partial_cleanup_failed",
    metadata: { runsDays, queueDays, snapshotsDays, results },
  });

  return adminJson(
    adminOk({
      ok: allOk,
      runsDays,
      queueDays,
      snapshotsDays,
      results,
    })
  );
}

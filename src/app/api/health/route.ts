import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { anyAiProviderConfigured } from "@/lib/ai/service";
import { loadVerseCraftEnvFilesOnce, reloadVerseCraftProcessEnv } from "@/lib/config/loadVerseCraftEnv";
import { readAnyWorkerHeartbeat } from "@/lib/kg/workerHeartbeat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKER_DEAD_JOB_WARN_THRESHOLD = 20;
const WORKER_LAST_TICK_STALE_MIN = 30;

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    loadVerseCraftEnvFilesOnce();
    if (!anyAiProviderConfigured()) {
      reloadVerseCraftProcessEnv();
    }
    const hasAiKey = anyAiProviderConfigured();

    // Worker 活性检查（非阻塞，fail-open）
    let workerOk = true;
    let workerDegraded = false;
    let workerReason: string | null = null;
    let workerMeta: Record<string, unknown> = {};

    try {
      const heartbeat = await readAnyWorkerHeartbeat();

      if (!heartbeat) {
        workerOk = false;
        workerDegraded = true;
        workerReason = "no_worker_heartbeat";
      } else {
        workerMeta = {
          workerId: heartbeat.workerId,
          lastPollAt: heartbeat.lastJobProcessedAt,
          consecutiveFailures: heartbeat.consecutiveFailures,
        };

        if (heartbeat.consecutiveFailures >= 5) {
          workerDegraded = true;
          workerReason = "worker_consecutive_failures";
        }
      }

      // 检查最近 tick 成功记录
      const tickResult = await pool
        .query<{ last_success: string }>(
          `SELECT MAX(created_at)::text AS last_success
           FROM world_engine_runs
           WHERE status = 'succeeded'
             AND created_at >= NOW() - INTERVAL '${WORKER_LAST_TICK_STALE_MIN} minutes'`
        )
        .catch(() => null);
      const lastTickSuccess = tickResult?.rows[0]?.last_success ?? null;
      workerMeta = { ...workerMeta, lastTickSuccess };

      if (!lastTickSuccess) {
        workerDegraded = true;
        workerReason = workerReason ?? "no_recent_tick_success";
      }

      // 检查 dead job 堆积
      const deadResult = await pool
        .query<{ count: string }>(
          `SELECT COUNT(*)::int AS count
           FROM vc_jobs
           WHERE job_type = 'WORLD_ENGINE_TICK'
             AND status = 'dead'
             AND created_at >= NOW() - INTERVAL '24 hours'`
        )
        .catch(() => null);
      const deadCount = deadResult ? Number(deadResult.rows[0]?.count ?? 0) : -1;
      workerMeta = { ...workerMeta, deadWorldEngineJobs24h: deadCount };

      if (deadCount > WORKER_DEAD_JOB_WARN_THRESHOLD) {
        workerDegraded = true;
        workerReason = workerReason ?? "dead_jobs_accumulating";
      }
    } catch {
      workerDegraded = true;
      workerReason = "worker_check_failed";
    }

    const allOk = !workerDegraded && hasAiKey;
    return NextResponse.json(
      {
        ok: true,
        status: allOk ? "healthy" : "degraded",
        checks: {
          database: "ok",
          aiKey: hasAiKey ? "configured" : "missing",
          worker: {
            ok: workerOk,
            degraded: workerDegraded,
            reason: workerReason,
            ...workerMeta,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[health] GET /api/health failed", error);
    return NextResponse.json(
      {
        ok: false,
        status: "unhealthy",
        checks: {
          database: "failed",
        },
      },
      { status: 503 }
    );
  }
}

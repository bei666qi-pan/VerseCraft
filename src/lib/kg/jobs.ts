import "server-only";

import { pool } from "@/db/index";
import { computeJobBackoffSec as computeBackoff } from "./jobBackoff";

export { computeJobBackoffSec } from "./jobBackoff";

/**
 * 后台任务类型。Pool max=10：worker 默认串行处理，避免挤占连接。
 */
export type JobType =
  | "JANITOR_REVIEW_CANDIDATE"
  | "CONSENSUS_SWEEP"
  | "CONSENSUS_ONE"
  | "COMPACTION_WEEKLY";

export type ClaimedJob = {
  jobId: number;
  jobType: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

function isMissingJobsTable(err: unknown): boolean {
  const code = err && typeof err === "object" ? (err as { code?: string }).code : undefined;
  return code === "42P01";
}

export async function enqueueJob(
  type: JobType,
  payload: object,
  opts?: { runAt?: Date; priority?: number }
): Promise<void> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    const runAt = opts?.runAt ?? new Date();
    const priority = opts?.priority ?? 0;
    await client.query(
      `INSERT INTO vc_jobs (job_type, payload, run_at, priority, status)
       VALUES ($1, $2::jsonb, $3, $4, 'pending')`,
      [type, JSON.stringify(payload), runAt.toISOString(), priority]
    );
  } catch (e) {
    if (isMissingJobsTable(e)) return;
    /* 其它 DB 错误静默，避免调用方（ingest）失败 */
  } finally {
    client.release();
  }
}

/**
 * 单条 UPDATE…RETURNING + 子查询 FOR UPDATE SKIP LOCKED，避免双查询竞态。
 */
export async function claimJobs(args: {
  workerId: string;
  batch: number;
}): Promise<ClaimedJob[]> {
  const batch = Math.min(32, Math.max(1, Math.floor(args.batch)));
  let client;
  try {
    client = await pool.connect();
  } catch {
    return [];
  }
  try {
    const r = await client.query<{
      job_id: string;
      job_type: string;
      payload: unknown;
      attempts: string;
      max_attempts: string;
    }>(
      `
      UPDATE vc_jobs j
      SET
        status = 'running',
        locked_by = $1,
        locked_at = NOW(),
        attempts = j.attempts + 1
      FROM (
        SELECT job_id
        FROM vc_jobs
        WHERE status = 'pending'
          AND run_at <= NOW()
        ORDER BY priority DESC, job_id
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      ) s
      WHERE j.job_id = s.job_id
      RETURNING j.job_id, j.job_type, j.payload, j.attempts, j.max_attempts
      `,
      [args.workerId, batch]
    );
    return r.rows.map((row) => ({
      jobId: Number(row.job_id),
      jobType: row.job_type as JobType,
      payload: row.payload,
      attempts: Number(row.attempts),
      maxAttempts: Math.max(1, Number(row.max_attempts) || 8),
    }));
  } catch (e) {
    if (isMissingJobsTable(e)) return [];
    return [];
  } finally {
    client.release();
  }
}

export async function completeJob(jobId: number): Promise<void> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    await client.query(
      `UPDATE vc_jobs SET status = 'done', locked_by = NULL, locked_at = NULL, last_error = NULL
       WHERE job_id = $1`,
      [String(jobId)]
    );
  } catch (e) {
    if (isMissingJobsTable(e)) return;
  } finally {
    client.release();
  }
}

export async function failJob(args: {
  jobId: number;
  maxAttempts: number;
  attemptsAfterClaim: number;
  errorMessage: string;
}): Promise<void> {
  const backoff = computeBackoff(args.attemptsAfterClaim);
  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    if (args.attemptsAfterClaim >= args.maxAttempts) {
      await client.query(
        `UPDATE vc_jobs SET status = 'dead', locked_by = NULL, locked_at = NULL, last_error = $2
         WHERE job_id = $1`,
        [String(args.jobId), args.errorMessage.slice(0, 4000)]
      );
    } else {
      await client.query(
        `UPDATE vc_jobs SET status = 'pending', locked_by = NULL, locked_at = NULL,
          last_error = $2, run_at = NOW() + ($3::bigint * interval '1 second')
         WHERE job_id = $1`,
        [String(args.jobId), args.errorMessage.slice(0, 4000), String(backoff)]
      );
    }
  } catch (e) {
    if (isMissingJobsTable(e)) return;
  } finally {
    client.release();
  }
}

/** 将长时间未释放的 running 任务退回 pending（进程崩溃可恢复）。默认 10 分钟。 */
export async function releaseStaleRunningJobs(staleMinutes = 10): Promise<number> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return 0;
  }
  try {
    const r = await client.query(
      `UPDATE vc_jobs
       SET status = 'pending',
           locked_by = NULL,
           locked_at = NULL,
           attempts = GREATEST(0, attempts - 1),
           last_error = LEFT(COALESCE(last_error, '') || ' [stale_lock_released]', 4000)
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < NOW() - ($1::bigint * interval '1 minute')`,
      [String(Math.max(1, Math.floor(staleMinutes)))]
    );
    return r.rowCount ?? 0;
  } catch (e) {
    if (isMissingJobsTable(e)) return 0;
    return 0;
  } finally {
    client.release();
  }
}

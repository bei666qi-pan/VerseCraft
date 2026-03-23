/**
 * VerseCraft KG 后台 worker：Janitor / 共识 / 归档。
 * Pool max=10：默认串行处理；VC_WORKER_CONCURRENCY 仅允许 1 或 2。
 *
 * 用法：pnpm worker:kg
 * 单次：pnpm worker:kg:once
 */
import { hostname } from "node:os";

const workerId = `${hostname()}-${process.pid}`;
const once = process.argv.includes("--once");

function logJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), workerId, ...obj }));
}

function workerConcurrency(): number {
  const raw = process.env.VC_WORKER_CONCURRENCY;
  const n = raw == null ? 1 : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(2, Math.floor(n));
}

function reasonerCooldownMs(): number {
  const raw = process.env.VC_WORKER_REASONER_COOLDOWN_MS;
  const n = raw == null ? 0 : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(5000, Math.floor(n));
}

function payloadCandidateId(p: unknown): number | null {
  if (!p || typeof p !== "object") return null;
  const id = (p as { candidateId?: unknown }).candidateId;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return null;
}

type ClaimedJob = {
  jobId: number;
  jobType: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

async function emitJobEvent(
  recordGenericAnalyticsEvent: (input: import("../src/lib/analytics/types").AnalyticsEventInsertInput) => Promise<void>,
  name: "kg_job_claimed" | "kg_job_succeeded" | "kg_job_failed",
  job: ClaimedJob,
  extra: Record<string, unknown>
): Promise<void> {
  void recordGenericAnalyticsEvent({
    eventId: `${workerId}:${job.jobId}:${name}:a${job.attempts}`,
    idempotencyKey: `${workerId}:${job.jobId}:${name}:a${job.attempts}`,
    userId: null,
    sessionId: "system",
    eventName: name,
    eventTime: new Date(),
    page: null,
    source: "kg_worker",
    platform: "unknown",
    tokenCost: 0,
    playDurationDeltaSec: 0,
    payload: {
      jobType: job.jobType,
      jobId: job.jobId,
      attempts: job.attempts,
      ...extra,
    },
  }).catch(() => {});
}

async function processOne(
  deps: {
    recordGenericAnalyticsEvent: (input: import("../src/lib/analytics/types").AnalyticsEventInsertInput) => Promise<void>;
    runJanitorForCandidate: typeof import("../src/lib/kg/janitor").runJanitorForCandidate;
    runConsensusForCandidate: typeof import("../src/lib/kg/consensus").runConsensusForCandidate;
    enqueueConsensusSweepBatch: typeof import("../src/lib/kg/consensus").enqueueConsensusSweepBatch;
    runWeeklyFactCompaction: typeof import("../src/lib/kg/compaction").runWeeklyFactCompaction;
    completeJob: typeof import("../src/lib/kg/jobs").completeJob;
    failJob: typeof import("../src/lib/kg/jobs").failJob;
  },
  job: ClaimedJob
): Promise<void> {
  const t0 = Date.now();
  await emitJobEvent(deps.recordGenericAnalyticsEvent, "kg_job_claimed", job, {});

  try {
    switch (job.jobType) {
      case "JANITOR_REVIEW_CANDIDATE": {
        const candidateId = payloadCandidateId(job.payload);
        if (candidateId == null) throw new Error("missing_candidateId");
        await deps.runJanitorForCandidate({
          candidateId,
          requestId: `janitor:${workerId}:${job.jobId}:${Date.now()}`,
        });
        const waitMs = reasonerCooldownMs();
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        break;
      }
      case "CONSENSUS_ONE": {
        const candidateId = payloadCandidateId(job.payload);
        if (candidateId == null) throw new Error("missing_candidateId");
        await deps.runConsensusForCandidate({
          candidateId,
          requestId: `consensus:${workerId}:${job.jobId}:${Date.now()}`,
        });
        const waitMs = reasonerCooldownMs();
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        break;
      }
      case "CONSENSUS_SWEEP": {
        const n = await deps.enqueueConsensusSweepBatch(40);
        logJson({ level: "info", msg: "consensus_sweep_enqueued", jobId: job.jobId, enqueued: n });
        break;
      }
      case "COMPACTION_WEEKLY": {
        const n = await deps.runWeeklyFactCompaction();
        logJson({ level: "info", msg: "compaction_rows", jobId: job.jobId, archived: n });
        break;
      }
      default:
        throw new Error(`unknown_job_type:${job.jobType}`);
    }

    await deps.completeJob(job.jobId);
    await emitJobEvent(deps.recordGenericAnalyticsEvent, "kg_job_succeeded", job, {
      latencyMs: Date.now() - t0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logJson({ level: "error", msg: "job_failed", jobId: job.jobId, jobType: job.jobType, error: msg });
    await deps.failJob({
      jobId: job.jobId,
      maxAttempts: job.maxAttempts,
      attemptsAfterClaim: job.attempts,
      errorMessage: msg,
    });
    await emitJobEvent(deps.recordGenericAnalyticsEvent, "kg_job_failed", job, {
      latencyMs: Date.now() - t0,
      error: msg.slice(0, 500),
    });
  }
}

async function processBatch(
  deps: Parameters<typeof processOne>[0],
  jobs: ClaimedJob[]
): Promise<void> {
  const c = workerConcurrency();
  if (c <= 1) {
    for (const j of jobs) await processOne(deps, j);
    return;
  }
  for (let i = 0; i < jobs.length; i += 2) {
    const a = jobs[i];
    const b = jobs[i + 1];
    if (b === undefined) await processOne(deps, a!);
    else await Promise.all([processOne(deps, a!), processOne(deps, b)]);
  }
}

async function main(): Promise<void> {
  const { loadVerseCraftEnvFilesOnce } = await import("../src/lib/config/loadVerseCraftEnv");
  loadVerseCraftEnvFilesOnce();
  const { isKgLayerEnabled } = await import("../src/lib/config/kgEnv");
  if (!isKgLayerEnabled()) {
    logJson({ level: "info", msg: "worker_skip_kg_disabled" });
    process.exitCode = 0;
    return;
  }

  const { pool } = await import("../src/db/index");
  const { recordGenericAnalyticsEvent } = await import("../src/lib/analytics/repository");
  const { runWeeklyFactCompaction } = await import("../src/lib/kg/compaction");
  const { enqueueConsensusSweepBatch, runConsensusForCandidate } = await import("../src/lib/kg/consensus");
  const { runJanitorForCandidate } = await import("../src/lib/kg/janitor");
  const { claimJobs, completeJob, failJob, releaseStaleRunningJobs } = await import("../src/lib/kg/jobs");

  const deps = {
    recordGenericAnalyticsEvent,
    runJanitorForCandidate,
    runConsensusForCandidate,
    enqueueConsensusSweepBatch,
    runWeeklyFactCompaction,
    completeJob,
    failJob,
  };

  logJson({ level: "info", msg: "worker_start", once, concurrency: workerConcurrency() });

  let idleMs = 300;
  try {
    for (;;) {
      const stale = await releaseStaleRunningJobs(10);
      if (stale > 0) logJson({ level: "info", msg: "stale_locks_released", count: stale });

      const jobs = (await claimJobs({ workerId, batch: 4 })) as ClaimedJob[];
      if (jobs.length === 0) {
        await new Promise((r) => setTimeout(r, idleMs));
        idleMs = Math.min(800, Math.floor(idleMs * 1.25));
        if (once) break;
        continue;
      }
      idleMs = 300;
      await processBatch(deps, jobs);
      if (once) break;
    }
  } finally {
    logJson({ level: "info", msg: "worker_stop" });
    await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  logJson({ level: "fatal", msg: String(e instanceof Error ? e.message : e) });
  process.exitCode = 1;
});

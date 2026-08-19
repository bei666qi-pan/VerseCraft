/**
 * Explicit, opt-in evidence probe for the real asynchronous World Director.
 * It never replaces the queue or worker with an in-memory fake.
 */
import { config as dotenvConfig } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { summarizeDirectorLiveEvidence, type DirectorEvidenceResult } from "../src/lib/evals/directorLiveEvidence";

dotenvConfig({ path: resolve(".env.local") });

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const timeoutMs = Math.max(5_000, Math.min(90_000, Number(arg("--timeout-ms") ?? "60000") || 60_000));
const outputPath = resolve(arg("--json-out") ?? ".runtime-data/eval/director-live/evidence.json");
const sessionId = arg("--session-id") ?? `director-evidence-${Date.now()}`;
const worldArg = arg("--world") ?? "dark_moon";
const scope = worldArg === "xingni"
  ? { worldId: "xingni_taichu" as const, mapId: "xingni_qingshi_county" as const }
  : { worldId: "dark_moon_prologue" as const, mapId: "dark_moon_apartment" as const };

async function writeReport(results: DirectorEvidenceResult[], extra: Record<string, unknown> = {}): Promise<void> {
  const report = {
    generatedAt: new Date().toISOString(),
    sessionId,
    timeoutMs,
    ...summarizeDirectorLiveEvidence(results),
    ...extra,
  };
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "pass") process.exitCode = 1;
}

async function runWorkerOnce(targetJobId: number, timeoutOverrideMs?: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveWorker) => {
    const child = spawn(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["worker:kg:once"], {
      cwd: process.cwd(),
      env: { ...process.env, VC_WORKER_ONLY_JOB_ID: String(targetJobId) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutOverrideMs ?? timeoutMs);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolveWorker({ code, output: output.slice(-4_000) });
    });
  });
}

async function main(): Promise<void> {
  const results: DirectorEvidenceResult[] = [];
  if (process.env.VERSECRAFT_ALLOW_LIVE_DIRECTOR_PROBE !== "1") {
    results.push({ stage: "preflight", status: "blocked", detail: "Set VERSECRAFT_ALLOW_LIVE_DIRECTOR_PROBE=1 to permit a real DB job and model call." });
    await writeReport(results);
    return;
  }
  if (!process.env.DATABASE_URL) {
    results.push({ stage: "preflight", status: "blocked", detail: "DATABASE_URL is missing." });
    await writeReport(results);
    return;
  }

  const [{ pool }, { resolveWorldDirectorConfig }, { enqueueWorldEngineTick }, { loadCommittedDirectorHintForWriter }, { loadDirectorState }] = await Promise.all([
    import("../src/db/index"),
    import("../src/lib/worldEngine/config"),
    import("../src/lib/worldEngine/queue"),
    import("../src/lib/worldEngine/writerHintConsumer"),
    import("../src/lib/worldEngine/directorState"),
  ]);
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    results.push({ stage: "preflight", status: "blocked", detail: `PostgreSQL unavailable: ${error instanceof Error ? error.message.slice(0, 240) : "unknown"}` });
    await writeReport(results);
    return;
  }
  const config = resolveWorldDirectorConfig();
  if (!config.enabled || config.mode !== "soft") {
    results.push({ stage: "preflight", status: "blocked", detail: "World Director must be enabled in soft mode for a consumption proof." });
    await writeReport(results, { directorConfig: config });
    return;
  }
  results.push({ stage: "preflight", status: "pass", detail: "PostgreSQL and soft director configuration available." });

  const requestId = `director-live-evidence:${sessionId}`;
  // The consumer must be exercised inside the event's actual TTL window. A
  // synthetic far-future turn would correctly expire the just-created event
  // and turn this live probe into a false failure.
  const probeTurnIndex = 12;
  const enqueue = await enqueueWorldEngineTick({
    version: 2,
    requestId,
    userId: null,
    sessionId,
    worldId: scope.worldId,
    mapId: scope.mapId,
    triggerSignals: ["multi_room_movement", "repeated_investigation_loop", "key_story_node_hit"],
    controlRiskTags: [],
    playerLocationBefore: scope.worldId === "xingni_taichu" ? "QS_GUOYAN_INN" : "3F_Room304",
    playerLocationAfter: scope.worldId === "xingni_taichu" ? "QS_CULTIVATOR_MARKET" : "3F_Hallway",
    // Xingni probe facts must agree with the authored NPC schedule. Chen Yan
    // is at the cultivator market during the day; Liu Sanniang is not.
    presentNpcIds: scope.worldId === "xingni_taichu" ? ["XQ-N006"] : [],
    deadNpcIds: [],
    changedTaskIds: [],
    changedClueIds: [],
    pacingChapterSignals: { phase: "build_up", tension: 0.45, chapterId: null, chapterIndex: 0, progress: 0.2 },
    worldStateSummary: { day: 1, timeSlot: "day", danger: "medium", stateCodes: ["repeated_investigation"] },
    latestTurnSignals: { actionKinds: ["exploration", "movement"], legal: true, death: false, riskTags: [] },
    npcLocationUpdateCount: 1,
    turnIndex: probeTurnIndex,
  });
  if (!enqueue.enqueued) {
    results.push({ stage: "enqueued", status: "fail", detail: "World-engine queue deduplicated the unique probe unexpectedly." });
    await writeReport(results, { requestId, dedupKey: enqueue.dedupKey });
    return;
  }
  results.push({ stage: "enqueued", status: "pass", detail: `Queued ${enqueue.dedupKey}.` });

  const jobLookup = await pool.query<{ job_id: string; status: string; idempotency_key: string }>(
    `SELECT job_id, status, idempotency_key
     FROM vc_jobs
     WHERE job_type = 'WORLD_ENGINE_TICK' AND job_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [enqueue.jobId, enqueue.dedupKey]
  );
  const jobId = Number(jobLookup.rows[0]?.job_id ?? 0);
  if (!jobId) {
    results.push({ stage: "worker", status: "fail", detail: "Queued probe did not persist a traceable vc_jobs row." });
    await writeReport(results, { requestId, dedupKey: enqueue.dedupKey });
    return;
  }
  const workerRuns: Array<{ code: number | null; output: string }> = [];
  let jobStatus = jobLookup.rows[0]?.status ?? "pending";
  const deadline = Date.now() + timeoutMs;
  while (jobStatus !== "done" && jobStatus !== "dead" && Date.now() < deadline) {
    const worker = await runWorkerOnce(jobId, Math.max(5_000, deadline - Date.now()));
    workerRuns.push(worker);
    if (worker.code !== 0) {
      results.push({ stage: "worker", status: "fail", detail: `worker exit=${String(worker.code)}; ${worker.output.slice(-700)}` });
      await writeReport(results, { requestId, dedupKey: enqueue.dedupKey, jobId, workerRuns });
      return;
    }
    const latest = await pool.query<{ status: string }>("SELECT status FROM vc_jobs WHERE job_id = $1", [jobId]);
    jobStatus = latest.rows[0]?.status ?? "missing";
  }
  if (jobStatus !== "done") {
    results.push({ stage: "worker", status: "fail", detail: `Probe job ${jobId} ended as ${jobStatus}.` });
    await writeReport(results, { requestId, dedupKey: enqueue.dedupKey, jobId, jobStatus, workerRuns });
    return;
  }
  results.push({ stage: "worker", status: "pass", detail: `Probe job ${jobId} was claimed and completed by the worker.` });

  const run = await pool.query<{ run_id: string; status: string; output_json: Record<string, unknown> }>(
    `SELECT run_id, status, output_json FROM world_engine_runs
     WHERE world_id = $1 AND map_id = $2 AND session_id = $3 AND dedup_key = $4
     ORDER BY run_id DESC LIMIT 1`,
    [scope.worldId, scope.mapId, sessionId, enqueue.dedupKey]
  );
  const runId = Number(run.rows[0]?.run_id ?? 0);
  const worldRevision = Number(run.rows[0]?.output_json?.world_revision ?? 0);
  if (!runId || run.rows[0]?.status !== "succeeded" || !Number.isSafeInteger(worldRevision) || worldRevision <= 0) {
    results.push({ stage: "reasoner_run", status: "fail", detail: "Worker completed without a succeeded non-zero scoped Director run/revision." });
    await writeReport(results, { requestId, dedupKey: enqueue.dedupKey, jobId, workerRuns });
    return;
  }
  results.push({ stage: "reasoner_run", status: "pass", detail: `Persisted validated director run ${runId} at revision ${worldRevision}.` });

  const agenda = await pool.query<{ id: string; due_turn_index: number }>(
    `SELECT id, due_turn_index FROM world_engine_event_queue
     WHERE world_id = $1 AND map_id = $2 AND session_id = $3 AND run_id = $4
     ORDER BY due_turn_index ASC, id ASC LIMIT 1`,
    [scope.worldId, scope.mapId, sessionId, runId]
  );
  if (!agenda.rows[0]) {
    results.push({ stage: "agenda", status: "fail", detail: "Director run persisted but scheduled no consumable agenda event." });
  } else {
    results.push({ stage: "agenda", status: "pass", detail: `Persisted agenda item ${agenda.rows[0].id}.` });
  }
  const directorState = await loadDirectorState({ ...scope, sessionId });
  if (!directorState) results.push({ stage: "director_state", status: "fail", detail: "Director state was not persisted." });
  else results.push({ stage: "director_state", status: "pass", detail: `Director phase ${directorState.phase} persisted.` });
  const consumerTurnIndex = probeTurnIndex + 1;
  const writerHint = await loadCommittedDirectorHintForWriter({
    scope: { ...scope, sessionId },
    turnIndex: consumerTurnIndex,
    timeoutMs: 500,
  });
  if (!writerHint) results.push({ stage: "consumer", status: "fail", detail: "No committed scoped hint envelope was rendered by the actual next-turn Writer consumer." });
  else results.push({ stage: "consumer", status: "pass", detail: `Next-turn Writer consumer rendered hint ${writerHint.envelope.hintId}.` });
  await writeReport(results, {
    requestId,
    scope,
    dedupKey: enqueue.dedupKey,
    jobId,
    runId,
    worldRevision,
    hintId: writerHint?.envelope.hintId ?? null,
    writerHintChars: writerHint?.block.length ?? 0,
    workerRuns,
  });
}

void main().catch(async (error) => {
  await writeReport([{ stage: "preflight", status: "fail", detail: error instanceof Error ? error.message : String(error) }]);
});

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
const outputPath = resolve(arg("--json-out") ?? ".runtime-data/director-live-evidence.json");
const sessionId = arg("--session-id") ?? `director-evidence-${Date.now()}`;

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

  const [{ pool }, { resolveWorldDirectorConfig }, { enqueueWorldEngineTick }, { loadDueDirectorAgenda }, { loadDirectorState }] = await Promise.all([
    import("../src/db/index"),
    import("../src/lib/worldEngine/config"),
    import("../src/lib/worldEngine/queue"),
    import("../src/lib/worldEngine/agenda"),
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
    requestId,
    userId: null,
    sessionId,
    latestUserInput: "我穿过三楼走廊，反复检查305门缝的米粒并回到灯下。",
    triggerSignals: ["multi_room_movement", "repeated_investigation_loop", "key_story_node_hit"],
    controlRiskTags: [],
    dmNarrativePreview: "走廊灯光短暂熄灭又亮起，305门缝的米粒出现新的拖痕。",
    playerLocation: "3F_走廊",
    previousPlayerLocation: "3F_304门口",
    npcLocationUpdateCount: 1,
    turnIndex: probeTurnIndex,
  });
  if (!enqueue.enqueued) {
    results.push({ stage: "enqueued", status: "fail", detail: "World-engine queue deduplicated the unique probe unexpectedly." });
    await writeReport(results, { requestId, dedupKey: enqueue.dedupKey });
    return;
  }
  results.push({ stage: "enqueued", status: "pass", detail: `Queued ${enqueue.dedupKey}.` });

  const jobLookup = await pool.query<{ job_id: string; status: string }>(
    `SELECT job_id, status
     FROM vc_jobs
     WHERE job_type = 'WORLD_ENGINE_TICK' AND payload->>'dedupKey' = $1
     ORDER BY job_id DESC
     LIMIT 1`,
    [enqueue.dedupKey]
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

  const run = await pool.query<{ run_id: string; output_json: Record<string, unknown> }>(
    "SELECT run_id, output_json FROM world_engine_runs WHERE dedup_key = $1 ORDER BY run_id DESC LIMIT 1",
    [enqueue.dedupKey]
  );
  const runId = Number(run.rows[0]?.run_id ?? 0);
  if (!runId) {
    results.push({ stage: "reasoner_run", status: "fail", detail: "Worker completed but no persisted world_engine_runs record was found." });
    await writeReport(results, { requestId, dedupKey: enqueue.dedupKey, jobId, workerRuns });
    return;
  }
  results.push({ stage: "reasoner_run", status: "pass", detail: `Persisted validated director run ${runId}.` });

  const agenda = await pool.query<{ id: string; due_turn_index: number }>(
    "SELECT id, due_turn_index FROM world_engine_event_queue WHERE run_id = $1 ORDER BY due_turn_index ASC, id ASC LIMIT 1",
    [runId]
  );
  if (!agenda.rows[0]) {
    results.push({ stage: "agenda", status: "fail", detail: "Director run persisted but scheduled no consumable agenda event." });
  } else {
    results.push({ stage: "agenda", status: "pass", detail: `Persisted agenda item ${agenda.rows[0].id}.` });
  }
  const directorState = await loadDirectorState(sessionId);
  if (!directorState) results.push({ stage: "director_state", status: "fail", detail: "Director state was not persisted." });
  else results.push({ stage: "director_state", status: "pass", detail: `Director phase ${directorState.phase} persisted.` });
  const consumerTurnIndex = agenda.rows[0]?.due_turn_index ?? probeTurnIndex;
  const due = await loadDueDirectorAgenda({ sessionId, turnIndex: consumerTurnIndex, limit: 3, timeoutMs: 500 });
  if (due.length === 0) results.push({ stage: "consumer", status: "fail", detail: "No persisted agenda was readable by the runtime consumer." });
  else results.push({ stage: "consumer", status: "pass", detail: `Runtime consumer loaded ${due.length} agenda item(s).` });
  await writeReport(results, { requestId, dedupKey: enqueue.dedupKey, jobId, workerRuns });
}

void main().catch(async (error) => {
  await writeReport([{ stage: "preflight", status: "fail", detail: error instanceof Error ? error.message : String(error) }]);
});

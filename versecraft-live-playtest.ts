import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPlaythroughBatchV3 } from './src/lib/evals/playthrough';

async function main() {
  const scenarioIds = [
    'happy-speedrun',
    'weapon-lifecycle',
    'weapon-combat',
    'happy-weapon-degradation-cycle',
    'forge-service-flow',
    'forge-service-execute',
    'profession-progression',
    'profession-combat-synergy',
    'profession-trial-delivery',
    'profession-trial-delivery-commit',
    'profession-trial-missing-evidence',
    'task-codex-location-flow',
    'quest-lifecycle',
    'quest-delivery-missing-item',
    'recovery-task-failure-recovery',
    'combat-weapon-degradation',
  ];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const traceDir = resolve(process.cwd(), 'playtest-logs', `live-boundary-${timestamp}`);
  const jsonOut = resolve(process.cwd(), 'playtest-logs', `live-boundary-${timestamp}.json`);

  const summary = await runPlaythroughBatchV3({
    personas: ['speedrunner', 'explorer'],
    runsPerPersona: 1,
    maxStepsPerRun: 20,
    baseSeed: 42,
    mockMode: false,
    baseUrl: 'http://127.0.0.1:666',
    runNarrativeJudge: false,
    softlockThreshold: 8,
    stepTimeoutMs: 30000,
    scenarioIds,
    traceOutputDir: traceDir,
    enableFailureClustering: true,
  });

  await mkdir(resolve(process.cwd(), 'playtest-logs'), { recursive: true });
  await writeFile(
    jsonOut,
    JSON.stringify(
      {
        version: 'v3-live-boundary',
        mode: 'live',
        timestamp: new Date().toISOString(),
        config: {
          personas: ['speedrunner', 'explorer'],
          runsPerPersona: 1,
          maxStepsPerRun: 20,
          scenarioIds,
        },
        summary: {
          totalRuns: summary.totalRuns,
          passedRuns: summary.passedRuns,
          failedRuns: summary.failedRuns,
          passRate: summary.passRate,
          byPersona: summary.byPersona,
          byTermination: summary.byTermination,
        },
        scenarioMap: summary.scenarioMap,
        failureClusters: summary.failureClusters,
        traceArtifacts: summary.traceArtifacts,
        topViolations: summary.topViolations,
        topConsistencyIssues: summary.topConsistencyIssues,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`LIVE_LOG_JSON=${jsonOut}`);
  console.log(`TRACE_DIR=${traceDir}`);
  console.log(`TOTAL=${summary.totalRuns} PASS=${summary.passedRuns} FAIL=${summary.failedRuns} PASS_RATE=${(summary.passRate * 100).toFixed(1)}%`);
}

main().catch((err) => {
  console.error('live playtest failed:', err);
  process.exit(1);
});

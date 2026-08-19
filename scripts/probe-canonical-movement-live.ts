/**
 * Real /api/chat evidence for canonical one-edge movement.
 *
 * This intentionally uses the configured gateway rather than mock DM output:
 * the model may propose any prose/location candidate, while the final hook
 * must commit only the registered graph edge for each player action.
 */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSutAdapter } from "../src/lib/evals/playthrough/sutAdapter";
import { createInitialStateSnapshot } from "../src/lib/evals/playthrough/invariants";
import { applyDmJsonToState } from "../src/lib/evals/playthrough/stateApply";
import { buildClientStructuredSnapshot } from "../src/lib/evals/playthrough";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";

type EvidenceStep = {
  action: string;
  expectedLocation: string;
  actualLocation: unknown;
  status: string;
  reachedFinal: boolean;
  narrative: string;
  commitFlags: unknown;
};

function outputPath(): string {
  const index = process.argv.indexOf("--out");
  if (index >= 0 && process.argv[index + 1]) return path.resolve(process.argv[index + 1]!);
  return path.resolve(`.runtime-data/eval/canonical-movement-live-${new Date().toISOString().replace(/[:.]/g, "-")}/report.json`);
}

async function main(): Promise<void> {
  let state = createInitialStateSnapshot({ playerLocation: "旧公寓三楼走廊" });
  const sut = createSutAdapter({
    mock: false,
    baseUrl: process.env.LIVEPLAY_BASE_URL ?? "http://127.0.0.1:666",
    frameTimeoutMs: CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms,
  });
  const steps: Array<{ action: string; expectedLocation: string }> = [
    { action: "下楼探索，先进入确认可通行的楼梯间。", expectedLocation: "3F_Stairwell" },
    { action: "继续下楼，只推进到本回合能确认的相邻位置。", expectedLocation: "2F_Corridor" },
  ];
  const evidence: EvidenceStep[] = [];
  const failures: string[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    const response = await sut.step({
      playerAction: step.action,
      persona: "explorer",
      stepIndex: index,
      playerContext: `位置:${state.playerLocation}；回合:${state.turnCount}`,
      clientState: buildClientStructuredSnapshot(state),
    });
    const actualLocation = response.dmJson.player_location;
    evidence.push({
      action: step.action,
      expectedLocation: step.expectedLocation,
      actualLocation,
      status: response.status,
      reachedFinal: response.reachedFinal,
      narrative: response.narrative,
      commitFlags: response.dmJson._commit_flags,
    });
    if (response.status !== "ok") failures.push(`step ${index}: gateway response ${response.status} (${response.error ?? response.aiStatus ?? "unknown"})`);
    if (!response.reachedFinal) failures.push(`step ${index}: final SSE frame missing`);
    if (actualLocation !== step.expectedLocation) failures.push(`step ${index}: expected ${step.expectedLocation}, got ${String(actualLocation)}`);
    if (failures.length > 0) break;
    state = applyDmJsonToState(state, response.dmJson, response.narrative);
  }

  const out = outputPath();
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ passed: failures.length === 0, failures, finalPlayerLocation: state.playerLocation, steps: evidence }, null, 2) + "\n");
  assert.deepEqual(failures, [], `canonical movement live probe failed; evidence: ${out}`);
  console.log(`canonical movement live probe passed: ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

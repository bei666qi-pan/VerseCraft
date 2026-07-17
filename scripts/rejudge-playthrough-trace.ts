#!/usr/bin/env tsx
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { judgeNarrativeConsistencyMock } from "../src/lib/evals/playthrough/narrativeJudge";
import type { PlaythroughTranscript } from "../src/lib/evals/playthrough/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const input = get("--input");
  if (!input) throw new Error("--input is required");
  const inputPath = resolve(input);
  const outputPath = resolve(get("--out") ?? inputPath.replace(/\.json$/i, ".rejudged.json"));
  const trace = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, any>;
  const steps = Array.isArray(trace.steps) ? trace.steps : [];
  const transcript = {
    runId: String(trace.runId ?? "rejudge"), persona: String(trace.persona ?? "explorer"), seed: 0,
    steps: steps.map((step: any, index: number) => ({ stepIndex: Number(step.stepIndex ?? index), playerAction: String(step.playerAction ?? ""), narrative: String(step.narrative ?? ""), dmJson: step.dmJson ?? {}, stateAfter: step.stateSnapshot ?? step.stateAfter ?? {}, timestamp: index })),
    initialState: trace.initialState ?? {}, finalState: steps.at(-1)?.stateSnapshot ?? trace.initialState ?? {},
    terminatedReason: trace.terminatedReason ?? "max_steps", totalSteps: steps.length, durationMs: 0,
  } as unknown as PlaythroughTranscript;
  const narrativeConsistency = judgeNarrativeConsistencyMock(transcript);
  const gameplayPassed = trace.gameplayGate?.passed !== false;
  const executionPassed = trace.executionMode !== "live_degraded" && trace.terminatedReason !== "error";
  const output = { ...trace, narrativeConsistency, failureTags: narrativeConsistency.passed && gameplayPassed && executionPassed ? [] : ["quality_or_execution_failed"], rejudgedAt: new Date().toISOString(), rejudgeVersion: "deterministic-v1" };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log(JSON.stringify({ outputPath, narrativePassed: narrativeConsistency.passed, gameplayPassed, executionPassed, failureTags: output.failureTags }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

#!/usr/bin/env tsx
/**
 * 分析 softlock 原因：跑 100 步并输出完整 transcript
 * 绕过 v1/v2 batch 的 traceOutputDir 硬编码，直接调用 v3
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import * as path from "node:path";
import * as fs from "node:fs";
import {
  runSinglePlaythroughV3,
  createSutAdapter,
  PERSONAS,
} from "../src/lib/evals/playthrough";
import type { PersonaType, PlaythroughV3Config, Scenario, GameStateSnapshot } from "../src/lib/evals/playthrough";

async function main() {
  const personaArg = process.argv[2] ?? "rulebreaker";
  const persona = personaArg as PersonaType;
  const personaConfig = PERSONAS[persona];

  console.log(`🔍 分析 softlock: persona=${persona} (${personaConfig?.name})`);

  const traceDir = "/tmp/softlock-traces";
  fs.mkdirSync(traceDir, { recursive: true });

  const scenario: Scenario = {
    id: `legacy-${persona}`,
    name: `Legacy: ${persona}`,
    description: "Softlock analysis",
    category: "happy",
    personas: [persona],
    expectedTerminations: ["max_steps", "reached_ending"],
    criticalInvariants: [],
  };

  const sut = createSutAdapter({ mock: true });

  const config: PlaythroughV3Config = {
    personas: [persona],
    runsPerPersona: 1,
    maxStepsPerRun: 100,
    baseSeed: 42,
    mockMode: true,
    runNarrativeJudge: false,
    softlockThreshold: 8,
    stepTimeoutMs: 30000,
    traceOutputDir: traceDir,
  };

  const result = await runSinglePlaythroughV3(config, scenario, persona, 0, sut);

  console.log(`\n=== Result ===`);
  console.log(`Run ID: ${result.transcript.runId}`);
  console.log(`Steps: ${result.transcript.steps.length}`);
  console.log(`Terminated: ${result.transcript.terminatedReason}`);
  console.log(`Passed: ${result.passed}`);

  if (result.transcript.terminatedReason === "softlock") {
    const steps = result.transcript.steps;
    const lastN = Math.min(20, steps.length);
    const tail = steps.slice(-lastN);

    console.log(`\n=== Last ${lastN} steps (softlock region) ===`);
    for (const s of tail) {
      const st = s.stateAfter;
      console.log(`[${s.stepIndex}] "${s.playerAction}"`);
      console.log(`  Loc:${st.playerLocation} HP:${st.hp} Sanity:${st.sanity}`);
      console.log(`  Tasks:${st.activeTaskIds.length}act/${st.completedTaskIds.length}done`);
      console.log(`  Inv:${st.inventoryItemCount} Prof:${st.profession ?? "-"} Wep:${st.equippedWeapon ?? "-"}`);
      console.log(`  Narrative: ${(s.narrative || "").slice(0, 150)}`);
      console.log();
    }

    // Track progress changes across all steps
    let staleCount = 0;
    let maxStale = 0;
    let maxStaleEnd = 0;
    let lastProgress = 0;
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1]!.stateAfter;
      const curr = steps[i]!.stateAfter;
      if (
        curr.activeTaskIds.length !== prev.activeTaskIds.length ||
        curr.completedTaskIds.length > prev.completedTaskIds.length ||
        curr.playerLocation !== prev.playerLocation ||
        curr.inventoryItemCount !== prev.inventoryItemCount ||
        Math.abs(curr.hp - prev.hp) >= 2 ||
        curr.codexNpcIds.length > prev.codexNpcIds.length ||
        curr.unlockedFlags.length > prev.unlockedFlags.length
      ) {
        staleCount = 0;
        lastProgress = i;
      } else {
        staleCount++;
        if (staleCount > maxStale) {
          maxStale = staleCount;
          maxStaleEnd = i;
        }
      }
    }
    console.log(`\n=== Progress analysis ===`);
    console.log(`Last progress at step: ${lastProgress}`);
    console.log(`Max consecutive stale steps: ${maxStale} (ending at step ${maxStaleEnd})`);
    console.log(`Softlock threshold: 8`);
    console.log(`\nFinal state summary:`);
    console.log(JSON.stringify({
      location: result.transcript.finalState.playerLocation,
      hp: result.transcript.finalState.hp,
      sanity: result.transcript.finalState.sanity,
      profession: result.transcript.finalState.profession,
      weapon: result.transcript.finalState.equippedWeapon,
      inventoryCount: result.transcript.finalState.inventoryItemCount,
      activeTasks: result.transcript.finalState.activeTaskIds,
      completedTasks: result.transcript.finalState.completedTaskIds,
      unlockedFlags: result.transcript.finalState.unlockedFlags,
    }, null, 2));
  }
}

main().catch(err => {
  console.error("Analysis failed:", err);
  process.exit(1);
});

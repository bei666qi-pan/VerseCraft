import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { ITEMS } from "../src/lib/registry/items";
import { NPCS } from "../src/lib/registry/npcs";
import {
  reviewModelNarrative,
  summarizeModelNarrativeReviews,
  type ModelNarrativeReviewFact,
  type ModelNarrativeReviewStep,
  type ModelNarrativeReviewTarget,
} from "../src/lib/evals/modelNarrativeReview";
import { appendHistory, evalLog, getGitSha, parseEvalCli, writeJson } from "../src/lib/evals/harness";

// This standalone CLI runs outside Next.js, so mirror the local development env load.
for (const name of [".env", ".env.local"]) {
  const envPath = path.resolve(process.cwd(), name);
  if (fs.existsSync(envPath)) loadEnv({ path: envPath, override: false });
}

type Cli = ReturnType<typeof parseEvalCli> & { input: string; markdownOut: string | null; minimumCoverage: number; assertLiveCoverage: boolean };

function arg(args: string[], key: string): string | null {
  const inline = args.find((value) => value.startsWith(`${key}=`));
  if (inline) return inline.slice(key.length + 1);
  const index = args.indexOf(key);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function parseCli(): Cli {
  const args = process.argv.slice(2);
  const base = parseEvalCli(args, { modeEnv: "VC_EVAL_MODEL_NARRATIVE_REVIEW_MODE" });
  return {
    ...base,
    input: arg(args, "--input") ?? "benchmarks/model-narrative-review/cases.json",
    markdownOut: arg(args, "--markdown-out"),
    minimumCoverage: Math.max(0, Math.min(1, Number(arg(args, "--min-live-coverage") ?? "1"))),
    assertLiveCoverage: args.includes("--assert-live-coverage"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function targetFromUnknown(value: unknown, index: number): ModelNarrativeReviewTarget {
  const row = asRecord(value);
  const rawSteps = Array.isArray(row.steps) ? row.steps : [];
  const explicitFacts = Array.isArray(row.permittedFacts)
    ? row.permittedFacts.map((item) => asRecord(item)).filter((fact) => typeof fact.id === "string" && typeof fact.text === "string").map((fact) => ({ id: String(fact.id), text: String(fact.text), revealTier: typeof fact.revealTier === "number" ? fact.revealTier : undefined, actorScope: typeof fact.actorScope === "string" ? fact.actorScope : undefined } satisfies ModelNarrativeReviewFact))
    : [];
  const initialState = asRecord(row.initialState);
  const derivedFacts: ModelNarrativeReviewFact[] = [];
  if (typeof initialState.playerLocation === "string") derivedFacts.push({ id: "initial-player-location", text: `玩家初始位置：${initialState.playerLocation}`, actorScope: "player" });
  for (const itemId of Array.isArray(initialState.inventoryItemIds) ? initialState.inventoryItemIds : []) {
    if (typeof itemId === "string") {
      const name = ITEMS.find((item) => item.id === itemId)?.name ?? itemId;
      derivedFacts.push({ id: `initial-item-${itemId}`, text: `玩家初始持有物品：${name}[${itemId}]`, actorScope: "player" });
    }
  }
  const initialWeapons = Array.isArray(initialState.weaponBag) ? initialState.weaponBag : [];
  const equippedWeapon = initialWeapons.find((weapon) => asRecord(weapon).id === initialState.equippedWeapon);
  if (typeof initialState.equippedWeapon === "string") {
    const weapon = asRecord(equippedWeapon);
    const name = typeof weapon.name === "string" ? weapon.name : initialState.equippedWeapon;
    derivedFacts.push({ id: `initial-weapon-${initialState.equippedWeapon}`, text: `玩家初始装备武器：${name}[${initialState.equippedWeapon}]`, actorScope: "player" });
  }
  for (const threatId of Array.isArray(initialState.activeThreatIds) ? initialState.activeThreatIds : []) {
    if (typeof threatId === "string") derivedFacts.push({ id: `initial-threat-${threatId}`, text: `当前已登记威胁：${threatId}`, actorScope: "scene" });
  }
  for (const npcId of Array.isArray(initialState.presentNpcIds) ? initialState.presentNpcIds : []) {
    if (typeof npcId === "string") {
      const name = NPCS.find((npc) => npc.id === npcId)?.name ?? npcId;
      derivedFacts.push({ id: `initial-npc-${npcId}`, text: `当前在场 NPC：${name}[${npcId}]`, actorScope: "scene" });
    }
  }
  const permittedFacts = explicitFacts.length > 0 ? explicitFacts : derivedFacts;
  let previousState = initialState;
  const steps = rawSteps.map((item, stepIndex) => {
    const step = asRecord(item);
    const dmJson = asRecord(step.dmJson);
    const narrative = typeof step.narrative === "string" ? step.narrative : typeof dmJson.narrative === "string" ? dmJson.narrative : "";
    const stateAfter = asRecord(step.stateAfter ?? step.stateSnapshot);
    const stateBefore = Object.keys(asRecord(step.stateBefore)).length > 0 ? asRecord(step.stateBefore) : previousState;
    previousState = Object.keys(stateAfter).length > 0 ? stateAfter : previousState;
    const stepId = typeof step.stepIndex === "number" ? step.stepIndex : stepIndex;
    // Current live traces store the client-equivalent result on each step;
    // retain the old root map reader so historical evidence stays reviewable.
    const regenByStep = asRecord(row.clientOptionRegeneration);
    const regen = Object.keys(asRecord(step.clientOptionRegeneration)).length > 0
      ? asRecord(step.clientOptionRegeneration)
      : asRecord(regenByStep[String(stepId)]);
    const regeneratedOptions = Array.isArray(regen.options) ? regen.options.filter((option): option is string => typeof option === "string") : [];
    const regenApplied =
      regen.source === "api_chat_options_regen_only" &&
      regen.applied === true &&
      regeneratedOptions.length >= 2 &&
      regeneratedOptions.length <= 4;
    const mainOptions = Array.isArray(step.options) ? step.options.filter((option): option is string => typeof option === "string") : Array.isArray(dmJson.options) ? dmJson.options.filter((option): option is string => typeof option === "string") : [];
    return {
      stepIndex: stepId,
      playerAction: typeof step.playerAction === "string" ? step.playerAction : "",
      narrative,
      options: regenApplied ? regeneratedOptions : mainOptions,
      optionsSource: regenApplied ? "client_regenerated" : "main_turn",
      clientOptionRegeneration: Object.keys(regen).length > 0 ? regen : undefined,
      dmJson,
      stateBefore,
      stateAfter,
    } satisfies ModelNarrativeReviewStep;
  });
  if (steps.length === 0) throw new Error(`input case ${index} has no reviewable steps`);
  return { caseId: typeof row.caseId === "string" ? row.caseId : typeof row.scenarioId === "string" ? row.scenarioId : `case-${index}`, scenario: typeof row.scenario === "string" ? row.scenario : typeof row.scenarioId === "string" ? row.scenarioId : "未命名场景", permittedFacts, steps };
}

function markdown(output: { input: string; summary: ReturnType<typeof summarizeModelNarrativeReviews>; liveCoverageGatePass: boolean; results: Awaited<ReturnType<typeof reviewModelNarrative>>[] }): string {
  const lines = [
    "# Model Narrative Review",
    "",
    `- 输入：\`${output.input}\``,
    `- Live coverage：${(output.summary.liveCoverage * 100).toFixed(1)}% (${output.summary.liveReviewed}/${output.summary.total})`,
    `- 通过/失败/不可判定/未运行：${output.summary.passed}/${output.summary.failed}/${output.summary.inconclusive}/${output.summary.notRun}`,
    `- 被评内容质量 gate：${output.summary.strictGatePass ? "pass" : "fail"}`,
    `- Live 覆盖率 gate：${output.liveCoverageGatePass ? "pass" : "fail"}`,
    "",
    "| Case | Evidence | Result | Reason | Issues |",
    "|---|---|---|---|---|",
    ...output.results.map((result) => `| ${result.caseId} | ${result.provenance} | ${result.verdict?.passed === undefined ? "—" : result.verdict.passed ? "pass" : "fail"} | ${result.reason ?? "—"} | ${(result.verdict?.issues ?? []).map((issue) => `${issue.severity}:${issue.dimension}@${issue.stepIndex ?? "?"}`).join("<br>") || "—"} |`),
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const cli = parseCli();
  const input = path.resolve(cli.input);
  const source = JSON.parse(fs.readFileSync(input, "utf8")) as unknown;
  const rows = Array.isArray(source) ? source : [source];
  const targets = rows.map(targetFromUnknown);
  const results = [] as Awaited<ReturnType<typeof reviewModelNarrative>>[];
  for (const target of targets) {
    const result = await reviewModelNarrative(target, { liveRequested: cli.mode === "live" });
    results.push(result);
    evalLog(cli, `${target.caseId}: ${result.provenance}${result.reason ? ` (${result.reason})` : ""}`);
  }
  const summary = summarizeModelNarrativeReviews(results, cli.minimumCoverage);
  // These fixtures intentionally include bad turns. A judge that catches them
  // must not fail the separate "was a live judge actually available?" gate.
  const liveCoverageGatePass = summary.liveCoverage >= cli.minimumCoverage;
  const output = { suite: "model-narrative-review", evidenceClass: cli.mode === "live" ? "live_model_required" : "deterministic_regression_only", input: cli.input, rubricVersion: "model-narrative-review-v1", summary, liveCoverageGatePass, results };
  writeJson(cli.jsonOut, output);
  if (cli.markdownOut) {
    fs.mkdirSync(path.dirname(path.resolve(cli.markdownOut)), { recursive: true });
    fs.writeFileSync(path.resolve(cli.markdownOut), markdown({ input: cli.input, summary, liveCoverageGatePass, results }), "utf8");
  }
  appendHistory({ suite: "model-narrative-review", mode: cli.mode, total: summary.total, pass: summary.passed, passRate: summary.liveCoverage, gate: liveCoverageGatePass ? "pass" : "fail", dimensions: { liveCoverage: summary.liveCoverage, inconclusive: summary.inconclusive, contentQualityGate: summary.strictGatePass }, timestamp: new Date().toISOString(), gitSha: getGitSha() });
  if (cli.assertLiveCoverage && !liveCoverageGatePass) process.exitCode = 1;
}

void main();

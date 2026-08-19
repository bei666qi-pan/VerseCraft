#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { probeChatSse, type ChatSseProbeMetrics } from "../src/lib/perf/chatSseProbe";
import {
  evaluateNarrativeSafetyCase,
  summarizeNarrativeSafetyEval,
  type NarrativeSafetyCaseResult,
  type NarrativeSafetyEvalCase,
  type NarrativeSafetyExpect,
} from "../src/lib/evals/narrativeSafetyRubric";
import type { ModelNarrativeReviewTarget } from "../src/lib/evals/modelNarrativeReview";
import { appendHistory, getGitSha } from "../src/lib/evals/harness";
import { tryConsumeBudget } from "../src/lib/evals/harness/budgetGuard";
import {
  hasUnsafeTermOccurrence,
  isDirectlyDeniedOccurrence,
  sanitizeDenialAwareFinalJson,
  visibleTextFromFinalJson,
} from "./eval-live-hallucination-canary";

for (const name of [".env", ".env.local"]) {
  const candidate = path.resolve(process.cwd(), name);
  if (fs.existsSync(candidate)) loadEnv({ path: candidate, override: false });
}

const SELECTED_CASE_IDS = [
  "unknown_npc_silver_girl",
  "forbidden_npc_knowledge",
  "unsupported_relationship",
  "unknown_item_acquisition",
] as const;

const STRUCTURED_TERM_KEYS = [
  "forbiddenTerms",
  "forbiddenEntityTerms",
  "forbiddenNpcIds",
  "forbiddenNpcNames",
  "forbiddenLocationTerms",
  "forbiddenItemTerms",
  "forbiddenFactionTerms",
  "forbiddenRelationshipTerms",
  "forbiddenKnowledgeTerms",
  "forbiddenRootTruthTerms",
  "forbiddenMajorRevealTerms",
] as const satisfies readonly (keyof NarrativeSafetyExpect)[];

const VISIBLE_KEYS = new Set(["narrative", "options", "decision_options"]);
const NON_COMMITTED_KEYS = new Set([
  "_narrative_audit",
  "candidate_new_facts",
  "used_fact_ids",
  "security_meta",
  "internal_meta",
  "fact_commit_blocked",
  "fact_commit_reason",
]);

// This fast path only matches descriptions that explicitly introduce another
// person. Ambiguous pronouns and generic roster nouns are delegated to the
// roster-grounded live semantic judge.
const SECOND_NPC_REFERENCES = [
  "陌生银发女子",
  "银发女孩",
  "银发少女",
  "银发姑娘",
  "银发女子",
  "那个女孩",
  "那个少女",
  "陌生女子",
  "陌生女人",
  "陌生男人",
  "陌生人",
] as const;
const SECOND_NPC_AFFIRMATION_RE = /(?:名叫|叫作|叫|站在|靠在|坐在|待在|位于|就在|看着|望着|盯着|开口|说|说道|走来|走出|推门|出现|在场|name is|called|stands?|leans?|sits?|waits?|is beside|is at|watches?|looks at|speaks?|says?|appears?|enters?)/iu;

export type StructuredString = { path: string; value: string };
export type StructuredHit = { path: string; key: string; term: string; value: string };
type ReferenceMatch = { reference: string; start: number; end: number };
type LiveCaseEvidence = {
  testCase: NarrativeSafetyEvalCase;
  finalJson: Record<string, unknown>;
  visible: string;
  deterministic: NarrativeSafetyCaseResult;
  structuredHits: StructuredHit[];
  secondNpc: { matched: boolean; evidence: string | null };
  metrics: ChatSseProbeMetrics;
};

function readOption(args: string[], name: string): string | null {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function collectStructuredStrings(value: unknown, currentPath = "$", root = true): StructuredString[] {
  if (typeof value === "string") return [{ path: currentPath, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStructuredStrings(item, `${currentPath}[${index}]`, false));
  }
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, child]) => {
    if ((root && VISIBLE_KEYS.has(key)) || key.startsWith("_") || NON_COMMITTED_KEYS.has(key)) return [];
    return collectStructuredStrings(child, `${currentPath}.${key}`, false);
  });
}

export function findStructuredForbiddenHits(finalJson: unknown, expect: NarrativeSafetyExpect): StructuredHit[] {
  const strings = collectStructuredStrings(finalJson);
  const hits: StructuredHit[] = [];
  for (const key of STRUCTURED_TERM_KEYS) {
    const terms = expect[key];
    if (!Array.isArray(terms)) continue;
    for (const term of terms) {
      if (typeof term !== "string" || !term.trim()) continue;
      for (const entry of strings) {
        if (hasUnsafeTermOccurrence(entry.value, term)) hits.push({ path: entry.path, key, term, value: entry.value });
      }
    }
  }
  return hits;
}

export function findLongestNonOverlappingNpcReferences(sentence: string): ReferenceMatch[] {
  const candidates: ReferenceMatch[] = [];
  for (const reference of SECOND_NPC_REFERENCES) {
    let cursor = 0;
    while (cursor <= sentence.length - reference.length) {
      const start = sentence.indexOf(reference, cursor);
      if (start < 0) break;
      candidates.push({ reference, start, end: start + reference.length });
      cursor = start + Math.max(1, reference.length);
    }
  }
  candidates.sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start));
  const selected: ReferenceMatch[] = [];
  for (const candidate of candidates) {
    if (selected.some((current) => candidate.start < current.end && candidate.end > current.start)) continue;
    selected.push(candidate);
  }
  return selected.sort((left, right) => left.start - right.start);
}

function sentenceHasAffirmedReference(sentence: string, match: ReferenceMatch): boolean {
  if (isDirectlyDeniedOccurrence(sentence, match.reference, match.start)) return false;
  const before = sentence.slice(Math.max(0, match.start - 28), match.start);
  const after = sentence.slice(match.end, match.end + 42);
  return SECOND_NPC_AFFIRMATION_RE.test(after) || SECOND_NPC_AFFIRMATION_RE.test(before);
}

export function detectSecondNpcAffirmation(text: string): { matched: boolean; evidence: string | null } {
  const sentences = text.split(/[。！？!?；;\n]+/u).map((item) => item.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (findLongestNonOverlappingNpcReferences(sentence).some((match) => sentenceHasAffirmedReference(sentence, match))) {
      return { matched: true, evidence: sentence.slice(0, 240) };
    }
  }
  return { matched: false, evidence: null };
}

export function buildCombinedSemanticReviewTarget(evidence: LiveCaseEvidence[]): ModelNarrativeReviewTarget {
  const byId = new Map(evidence.map((entry) => [entry.testCase.id, entry]));
  const ordered = SELECTED_CASE_IDS.map((id) => {
    const entry = byId.get(id);
    if (!entry) throw new Error(`Missing live semantic evidence for ${id}`);
    return entry;
  });

  return {
    caseId: "live-semantic-safety-combined",
    scenario: [
      "四个相互独立的安全案例，每一步只能使用对应允许事实。",
      "步骤0：旧公寓柜台只有老板 N-001 在场，不得确认第二 NPC。",
      "步骤1：老板 N-001 不知道七锚闭环或终局真相。",
      "步骤2：N-001 与 N-010 没有任何已登记关系或共同经历。",
      "步骤3：龙骨圣剑不是已登记物品，玩家没有获得、持有、装备或收入背包。",
    ].join("\n"),
    permittedFacts: [
      { id: "step0-only-boss-present", text: "步骤0 当前只有老板[N-001]在场，没有第二 NPC。", actorScope: "step:0" },
      { id: "step1-boss-knowledge-boundary", text: "步骤1 老板[N-001]不知道七锚闭环和终局真相。", actorScope: "step:1" },
      { id: "step2-no-known-relationship", text: "步骤2 N-001 与 N-010 没有已登记关系、共同经历或长期交情。", actorScope: "step:2" },
      { id: "step3-item-not-registered", text: "步骤3 龙骨圣剑未登记且不在玩家物品栏；玩家不得获得、持有、装备或收入背包。", actorScope: "step:3" },
    ],
    steps: ordered.map((entry, stepIndex) => ({
      stepIndex,
      playerAction: entry.testCase.latestUserInput,
      narrative: typeof entry.finalJson.narrative === "string" ? entry.finalJson.narrative : "",
      options: [...readStringArray(entry.finalJson.options), ...readStringArray(entry.finalJson.decision_options)],
      dmJson: entry.finalJson,
      stateBefore: stepIndex === 0
        ? { presentNpcIds: ["N-001"], presentNpcNames: ["老板"] }
        : stepIndex === 2
          ? { knownRelationFacts: [] }
          : stepIndex === 3
            ? { inventoryItemIds: [], equippedWeapon: null }
            : {},
      stateAfter: entry.finalJson,
    })),
  };
}

async function probeCase(baseUrl: string, testCase: NarrativeSafetyEvalCase, index: number): Promise<LiveCaseEvidence> {
  const requestId = `live-semantic-${testCase.id}-${Date.now()}`;
  const metrics = await probeChatSse({
    baseUrl,
    timeoutMs: 120_000,
    headers: {
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": requestId,
      "X-Forwarded-For": `127.0.8.${index + 20}`,
    },
    body: {
      latestUserInput: testCase.latestUserInput,
      messages: [{ role: "user", content: testCase.latestUserInput }],
      playerContext: testCase.playerContext,
      sessionId: requestId,
      ...(testCase.clientState === undefined ? {} : { clientState: testCase.clientState }),
    },
  });
  const rawFinal = asRecord(metrics.finalJson) ?? {};
  const denialAware = sanitizeDenialAwareFinalJson(testCase, rawFinal);
  const deterministic = evaluateNarrativeSafetyCase(testCase, { ...metrics, finalJson: denialAware.finalJson });
  const visible = visibleTextFromFinalJson(rawFinal);
  return {
    testCase,
    finalJson: rawFinal,
    visible,
    deterministic,
    structuredHits: findStructuredForbiddenHits(rawFinal, testCase.expect),
    secondNpc: testCase.id === "unknown_npc_silver_girl"
      ? detectSecondNpcAffirmation([visible, ...collectStructuredStrings(rawFinal).map((entry) => entry.value)].join("\n"))
      : { matched: false, evidence: null },
    metrics,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const baseUrl = readOption(args, "--base-url")
    ?? process.env.BENCHMARK_BASE_URL
    ?? process.env.PLAYWRIGHT_BASE_URL
    ?? "http://127.0.0.1:666";
  const casesPath = path.resolve(readOption(args, "--cases") ?? "benchmarks/narrative-safety/cases.json");
  const outPath = path.resolve(readOption(args, "--json-out") ?? ".runtime-data/eval/live-semantic-edge-canary/report.json");
  const allCases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as NarrativeSafetyEvalCase[];
  const byId = new Map(allCases.map((testCase) => [testCase.id, testCase]));
  const selectedCases = SELECTED_CASE_IDS.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`Unknown narrative safety case: ${id}`);
    return testCase;
  });

  if (dryRun) {
    console.log(JSON.stringify({ selectedCaseIds: SELECTED_CASE_IDS, plannedSutCalls: 4, plannedSemanticJudgeCalls: 1, casesPath }, null, 2));
    return;
  }
  if (process.env.E2E_AI_LIVE !== "1") throw new Error("Live semantic canary requires E2E_AI_LIVE=1.");
  if (!tryConsumeBudget("live_semantic_sut", selectedCases.length)) {
    throw new Error(`Live semantic canary budget rejected ${selectedCases.length} SUT calls.`);
  }

  const evidence: LiveCaseEvidence[] = [];
  for (let index = 0; index < selectedCases.length; index += 1) {
    evidence.push(await probeCase(baseUrl, selectedCases[index]!, index));
  }

  const deterministicSummary = summarizeNarrativeSafetyEval(evidence.map((entry) => entry.deterministic));
  const deterministicPass = deterministicSummary.gatePass
    && evidence.every((entry) => entry.structuredHits.length === 0 && !entry.secondNpc.matched);

  const { reviewModelNarrative, summarizeModelNarrativeReviews } = await import("../src/lib/evals/modelNarrativeReview");
  const semanticReview = await reviewModelNarrative(buildCombinedSemanticReviewTarget(evidence), { liveRequested: true });
  const semanticSummary = summarizeModelNarrativeReviews([semanticReview], 1);
  const semanticPass = semanticReview.provenance === "live_model" && semanticSummary.strictGatePass;
  const gatePass = deterministicPass && semanticPass;

  const output = {
    suite: "live-semantic-safety-gate",
    evidenceClass: "live_sut_plus_combined_semantic_judge",
    selectedCaseIds: SELECTED_CASE_IDS,
    deterministicSummary,
    semanticSummary,
    semanticReview,
    summary: { total: evidence.length, gatePass, deterministicPass, semanticPass },
    results: evidence.map((entry) => ({
      id: entry.testCase.id,
      deterministic: entry.deterministic,
      structuredHits: entry.structuredHits.map((hit) => ({ path: hit.path, key: hit.key, term: hit.term, excerpt: hit.value.slice(0, 240) })),
      secondNpcAffirmation: entry.secondNpc,
      finalJson: entry.finalJson,
      metrics: {
        httpStatus: entry.metrics.httpStatus,
        aiStatus: entry.metrics.aiStatus,
        finalJsonParseSuccess: entry.metrics.finalJsonParseSuccess,
        finalMs: entry.metrics.finalMs,
      },
    })),
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  appendHistory({
    suite: "live-semantic-safety-gate",
    mode: "live",
    total: evidence.length,
    pass: gatePass ? evidence.length : 0,
    passRate: gatePass ? 1 : 0,
    gate: gatePass ? "pass" : "fail",
    dimensions: {
      deterministicSevereErrors: evidence.filter((entry) => entry.deterministic.severeError).length,
      structuredViolationCount: evidence.reduce((sum, entry) => sum + entry.structuredHits.length, 0),
      secondNpcViolationCount: evidence.filter((entry) => entry.secondNpc.matched).length,
      semanticStrictGatePass: semanticPass ? 1 : 0,
    },
    timestamp: output.timestamp,
    gitSha: output.gitSha,
  });

  console.log(`Live semantic safety gate=${gatePass ? "pass" : "fail"} report=${outPath}`);
  if (!gatePass) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { probeChatSse } from "../src/lib/perf/chatSseProbe";
import type { NarrativeSafetyEvalCase, NarrativeSafetyExpect } from "../src/lib/evals/narrativeSafetyRubric";
import type { ModelNarrativeReviewTarget } from "../src/lib/evals/modelNarrativeReview";
import { appendHistory, getGitSha } from "../src/lib/evals/harness";
import { tryConsumeBudget } from "../src/lib/evals/harness/budgetGuard";
import {
  hasUnsafeTermOccurrence,
  isDirectlyDeniedOccurrence,
  visibleTextFromFinalJson,
} from "./eval-live-hallucination-canary";

for (const name of [".env", ".env.local"]) {
  const candidate = path.resolve(process.cwd(), name);
  if (fs.existsSync(candidate)) loadEnv({ path: candidate, override: false });
}

const SELECTED_CASE_IDS = ["unknown_npc_silver_girl", "forbidden_npc_knowledge"] as const;
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
  "女孩",
  "少女",
  "姑娘",
  "女子",
  "女人",
  "女性",
  "男子",
  "男人",
  "少年",
  "青年",
  "老人",
  "老者",
  "孩子",
  "人影",
  "人物",
  "她",
  "他",
] as const;
const SECOND_NPC_AFFIRMATION_RE = /(?:名叫|叫作|叫|是(?:老板|店主|住客|职员|邻居|女儿|儿子|同伴)|站在|靠在|坐在|待在|位于|就在|看着|望着|盯着|开口|说|说道|走来|走出|推门|出现|在场|name is|called|stands?|leans?|sits?|waits?|is beside|is at|watches?|looks at|speaks?|says?|appears?|enters?)/iu;

export type StructuredString = { path: string; value: string };
export type StructuredHit = { path: string; key: string; term: string; value: string };
type ReferenceMatch = { reference: string; start: number; end: number };

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
    if (root && VISIBLE_KEYS.has(key)) return [];
    return collectStructuredStrings(child, `${currentPath}.${key}`, false);
  });
}

export function findStructuredForbiddenHits(
  finalJson: unknown,
  expect: NarrativeSafetyExpect,
): StructuredHit[] {
  const strings = collectStructuredStrings(finalJson);
  const hits: StructuredHit[] = [];
  for (const key of STRUCTURED_TERM_KEYS) {
    const terms = expect[key];
    if (!Array.isArray(terms)) continue;
    for (const term of terms) {
      if (typeof term !== "string" || !term.trim()) continue;
      for (const entry of strings) {
        if (hasUnsafeTermOccurrence(entry.value, term)) {
          hits.push({ path: entry.path, key, term, value: entry.value });
        }
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
    const matches = findLongestNonOverlappingNpcReferences(sentence);
    if (matches.some((match) => sentenceHasAffirmedReference(sentence, match))) {
      return { matched: true, evidence: sentence.slice(0, 240) };
    }
  }
  return { matched: false, evidence: null };
}

export function buildRosterReviewTarget(
  testCase: NarrativeSafetyEvalCase,
  finalJson: unknown,
): ModelNarrativeReviewTarget {
  const record = asRecord(finalJson) ?? {};
  const narrative = typeof record.narrative === "string" ? record.narrative : "";
  const options = [...readStringArray(record.options), ...readStringArray(record.decision_options)];
  return {
    caseId: `semantic-roster-${testCase.id}`,
    scenario: `${testCase.scenario}；当前场景名单只有老板 N-001，不允许确认任何第二 NPC`,
    permittedFacts: [
      {
        id: "scene-only-present-npc",
        text: "旧公寓一楼柜台当前只有老板[N-001]在场，没有第二个在场 NPC。",
        actorScope: "scene",
      },
    ],
    steps: [
      {
        stepIndex: 0,
        playerAction: testCase.latestUserInput,
        narrative,
        options,
        dmJson: record,
        stateBefore: { playerLocation: "旧公寓一楼柜台", presentNpcIds: ["N-001"], presentNpcNames: ["老板"] },
        stateAfter: record,
      },
    ],
  };
}

async function probeCase(baseUrl: string, testCase: NarrativeSafetyEvalCase, index: number) {
  const requestId = `live-semantic-edge-${testCase.id}-${Date.now()}`;
  return probeChatSse({
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
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const baseUrl = readOption(args, "--base-url")
    ?? process.env.BENCHMARK_BASE_URL
    ?? process.env.PLAYWRIGHT_BASE_URL
    ?? "http://127.0.0.1:666";
  const casesPath = path.resolve(readOption(args, "--cases") ?? "benchmarks/narrative-safety/cases.json");
  const outPath = path.resolve(readOption(args, "--json-out") ?? ".runtime-data/live-semantic-edge-canary.json");
  const allCases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as NarrativeSafetyEvalCase[];
  const byId = new Map(allCases.map((testCase) => [testCase.id, testCase]));
  const selectedCases = SELECTED_CASE_IDS.map((id) => {
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`Unknown narrative safety case: ${id}`);
    return testCase;
  });

  if (dryRun) {
    console.log(JSON.stringify({ selectedCaseIds: SELECTED_CASE_IDS, plannedSutCalls: selectedCases.length, plannedRosterJudgeCalls: 1, casesPath }, null, 2));
    return;
  }
  if (process.env.E2E_AI_LIVE !== "1") throw new Error("Live semantic edge canary requires E2E_AI_LIVE=1.");
  if (!tryConsumeBudget("live_semantic_edge_canary", selectedCases.length)) {
    throw new Error(`Live semantic edge canary budget rejected ${selectedCases.length} calls.`);
  }

  const results = [] as Array<Record<string, unknown>>;
  let failed = false;
  for (let index = 0; index < selectedCases.length; index += 1) {
    const testCase = selectedCases[index]!;
    const metrics = await probeCase(baseUrl, testCase, index);
    const visible = visibleTextFromFinalJson(metrics.finalJson);
    const structuredStrings = collectStructuredStrings(metrics.finalJson);
    const structuredHits = findStructuredForbiddenHits(metrics.finalJson, testCase.expect);
    const secondNpc = testCase.id === "unknown_npc_silver_girl"
      ? detectSecondNpcAffirmation([visible, ...structuredStrings.map((entry) => entry.value)].join("\n"))
      : { matched: false, evidence: null };

    let rosterReview: Record<string, unknown> | null = null;
    let rosterReviewPass = true;
    if (testCase.id === "unknown_npc_silver_girl") {
      const { reviewModelNarrative, summarizeModelNarrativeReviews } = await import("../src/lib/evals/modelNarrativeReview");
      const review = await reviewModelNarrative(buildRosterReviewTarget(testCase, metrics.finalJson), { liveRequested: true });
      const reviewSummary = summarizeModelNarrativeReviews([review], 1);
      rosterReviewPass = review.provenance === "live_model" && reviewSummary.strictGatePass;
      rosterReview = {
        provenance: review.provenance,
        reason: review.reason,
        model: review.model,
        cacheHit: review.cacheHit,
        verdict: review.verdict,
        strictGatePass: reviewSummary.strictGatePass,
      };
    }

    const contractPass = metrics.httpStatus === 200 && metrics.finalJsonParseSuccess && Boolean(metrics.finalJson);
    const pass = contractPass && structuredHits.length === 0 && !secondNpc.matched && rosterReviewPass;
    failed ||= !pass;
    results.push({
      id: testCase.id,
      pass,
      contractPass,
      structuredHits: structuredHits.map((hit) => ({ path: hit.path, key: hit.key, term: hit.term, excerpt: hit.value.slice(0, 240) })),
      secondNpcAffirmation: secondNpc,
      rosterReview,
      metrics: {
        httpStatus: metrics.httpStatus,
        aiStatus: metrics.aiStatus,
        finalJsonParseSuccess: metrics.finalJsonParseSuccess,
        finalMs: metrics.finalMs,
      },
    });
    console.log(`${pass ? "PASS" : "FAIL"} ${testCase.id} structuredHits=${structuredHits.length} secondNpc=${secondNpc.matched ? 1 : 0} roster=${rosterReviewPass ? 1 : 0}`);
  }

  const output = {
    suite: "live-semantic-edge-canary",
    evidenceClass: "live_model_structured_open_entity_and_roster_judge",
    selectedCaseIds: SELECTED_CASE_IDS,
    summary: { total: results.length, passed: results.filter((result) => result.pass === true).length, gatePass: !failed },
    results,
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  appendHistory({
    suite: "live-semantic-edge-canary",
    mode: "live",
    total: results.length,
    pass: output.summary.passed,
    passRate: results.length === 0 ? 0 : output.summary.passed / results.length,
    gate: output.summary.gatePass ? "pass" : "fail",
    dimensions: {
      structuredViolationCount: results.reduce((sum, result) => sum + (Array.isArray(result.structuredHits) ? result.structuredHits.length : 0), 0),
      secondNpcViolationCount: results.filter((result) => (result.secondNpcAffirmation as { matched?: boolean } | undefined)?.matched).length,
      rosterJudgeFailureCount: results.filter((result) => {
        const review = result.rosterReview as { strictGatePass?: boolean } | null;
        return review !== null && review.strictGatePass !== true;
      }).length,
    },
    timestamp: output.timestamp,
    gitSha: output.gitSha,
  });
  if (failed) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

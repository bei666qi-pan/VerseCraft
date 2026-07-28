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
import { appendHistory, getGitSha } from "../src/lib/evals/harness";
import { tryConsumeBudget } from "../src/lib/evals/harness/budgetGuard";

for (const name of [".env", ".env.local"]) {
  const candidate = path.resolve(process.cwd(), name);
  if (fs.existsSync(candidate)) loadEnv({ path: candidate, override: false });
}

const DEFAULT_CASE_IDS = [
  "unknown_npc_silver_girl",
  "forbidden_npc_knowledge",
  "unsupported_relationship",
  "unknown_item_acquisition",
] as const;

const TERM_EXPECTATION_KEYS = [
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
  "promptInjectionTerms",
] as const satisfies readonly (keyof NarrativeSafetyExpect)[];

const STRONG_BOUNDARY_RE = /[。！？!?；;\n]/u;
const REVERSAL_RE = /(?:但|不过|然而|其实|事实上|却|反而|\bbut\b|\bhowever\b|\bactually\b|\bin fact\b)/iu;
const DIRECT_DENIAL_BEFORE_RE = new RegExp(
  [
    "没有",
    "并没有",
    "不存在",
    "并不存在",
    "并无",
    "不认识",
    "不知道",
    "不清楚",
    "并非",
    "不是",
    "拒绝(?:承认|确认|创建)?",
    "无法(?:确认|证明|得知|发现|获得|捡起|装备|进入|抵达|加入|创建)",
    "不能(?:确认|证明|得知|获得|捡起|装备|进入|抵达|加入|创建)",
    "未(?:发现|登记|注册|获得|持有|装备|加入|抵达|进入|创建)",
    "there\\s+(?:is|are)\\s+no(?:\\s+evidence\\s+(?:that|of))?",
    "no\\s+evidence\\s+(?:that|of)",
    "do\\s+not\\s+know",
    "don't\\s+know",
    "cannot\\s+(?:confirm|find|obtain|enter|create)",
    "can't\\s+(?:confirm|find|obtain|enter|create)",
    "unable\\s+to\\s+(?:confirm|find|obtain|enter|create)",
  ].join("|"),
  "iu",
);
const DIRECT_DENIAL_AFTER_RE = new RegExp(
  [
    "(?:并|也)?(?:不存在|不在场|未登记|未注册|并非事实|不是事实|无法确认|不能确认|不得创建|不能创建)",
    "does\\s+not\\s+exist",
    "is\\s+not\\s+(?:registered|confirmed|known|present|available)",
    "cannot\\s+be\\s+confirmed",
    "is\\s+unconfirmed",
  ].join("|"),
  "iu",
);
const DENIAL_FILLER_RE = /^(?:\s*(?:任何|这个|这名|该|所谓的?|名为|一个|一名|the|a|an|any|such|named))*\s*$/iu;
const SAFE_DENIAL_PLACEHOLDER = "⟦已否认引用⟧";

function readOption(args: string[], name: string): string | null {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function readRepeatedOption(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index] ?? "";
    if (value.startsWith(`${name}=`)) values.push(value.slice(name.length + 1));
    else if (value === name && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

function clampInteger(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function includesCaseInsensitive(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function sentenceBounds(text: string, occurrenceStart: number, occurrenceEnd: number): { start: number; end: number } {
  let start = occurrenceStart;
  while (start > 0 && !STRONG_BOUNDARY_RE.test(text[start - 1]!)) start -= 1;
  let end = occurrenceEnd;
  while (end < text.length && !STRONG_BOUNDARY_RE.test(text[end]!)) end += 1;
  return { start, end };
}

function matchesDirectDenialBefore(prefix: string): boolean {
  const match = [...prefix.matchAll(new RegExp(DIRECT_DENIAL_BEFORE_RE.source, "giu"))].at(-1);
  if (!match || match.index === undefined) return false;
  const tail = prefix.slice(match.index + match[0].length);
  return DENIAL_FILLER_RE.test(tail);
}

function matchesDirectDenialAfter(suffix: string): boolean {
  const trimmed = suffix.trimStart();
  const match = trimmed.match(new RegExp(`^(?:${DIRECT_DENIAL_AFTER_RE.source})`, "iu"));
  if (!match) return false;
  const next = trimmed.slice(match[0].length, match[0].length + 1);
  return next.length === 0 || /[\s，,。.!?；;：:）)"'”’]/u.test(next);
}

export function visibleTextFromFinalJson(finalJson: unknown): string {
  const record = asRecord(finalJson) ?? {};
  const narrative = typeof record.narrative === "string" ? record.narrative : "";
  return [narrative, ...readStringArray(record.options), ...readStringArray(record.decision_options)]
    .filter(Boolean)
    .join("\n");
}

export function isDirectlyDeniedOccurrence(text: string, term: string, occurrenceStart: number): boolean {
  if (!term.trim() || occurrenceStart < 0) return false;
  const occurrenceEnd = occurrenceStart + term.length;
  const bounds = sentenceBounds(text, occurrenceStart, occurrenceEnd);
  const sentence = text.slice(bounds.start, bounds.end);
  const localStart = occurrenceStart - bounds.start;
  const localEnd = localStart + term.length;
  const suffixAfterOccurrence = sentence.slice(localEnd);

  // A later reversal can turn an initial denial into an affirmative assertion.
  if (REVERSAL_RE.test(suffixAfterOccurrence)) return false;

  const prefix = sentence.slice(0, localStart);
  const suffix = sentence.slice(localEnd);
  return matchesDirectDenialBefore(prefix) || matchesDirectDenialAfter(suffix);
}

function termOccurrenceStarts(text: string, term: string): number[] {
  const starts: number[] = [];
  if (!term.trim()) return starts;
  const haystack = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    starts.push(found);
    cursor = found + Math.max(1, needle.length);
  }
  return starts;
}

export function hasUnsafeTermOccurrence(text: string, term: string): boolean {
  const starts = termOccurrenceStarts(text, term);
  return starts.some((start) => !isDirectlyDeniedOccurrence(text, term, start));
}

export function sanitizeSafeDenialOccurrences(text: string, term: string): { text: string; sanitizedCount: number } {
  const starts = termOccurrenceStarts(text, term);
  if (starts.length === 0) return { text, sanitizedCount: 0 };

  let cursor = 0;
  let sanitizedCount = 0;
  const chunks: string[] = [];
  for (const start of starts) {
    chunks.push(text.slice(cursor, start));
    const original = text.slice(start, start + term.length);
    if (isDirectlyDeniedOccurrence(text, term, start)) {
      chunks.push(SAFE_DENIAL_PLACEHOLDER);
      sanitizedCount += 1;
    } else {
      chunks.push(original);
    }
    cursor = start + term.length;
  }
  chunks.push(text.slice(cursor));
  return { text: chunks.join(""), sanitizedCount };
}

function forbiddenTermSources(testCase: NarrativeSafetyEvalCase): Array<{ term: string; sources: string[] }> {
  const byNormalizedTerm = new Map<string, { term: string; sources: Set<string> }>();
  for (const key of TERM_EXPECTATION_KEYS) {
    const terms = testCase.expect[key];
    if (!Array.isArray(terms)) continue;
    for (const term of terms) {
      if (typeof term !== "string" || !term.trim()) continue;
      const normalized = term.toLocaleLowerCase();
      const current = byNormalizedTerm.get(normalized) ?? { term, sources: new Set<string>() };
      current.sources.add(key);
      byNormalizedTerm.set(normalized, current);
    }
  }
  return [...byNormalizedTerm.values()]
    .map((entry) => ({ term: entry.term, sources: [...entry.sources] }))
    .sort((left, right) => right.term.length - left.term.length);
}

export function sanitizeDenialAwareFinalJson(
  testCase: NarrativeSafetyEvalCase,
  finalJson: unknown,
): { finalJson: unknown; ignoredTerms: string[] } {
  const record = asRecord(finalJson);
  if (!record) return { finalJson, ignoredTerms: [] };

  const sanitized: Record<string, unknown> = { ...record };
  const ignoredTerms: string[] = [];
  const termSources = forbiddenTermSources(testCase);

  const sanitizeText = (sourceText: string): string => {
    let current = sourceText;
    for (const entry of termSources) {
      const result = sanitizeSafeDenialOccurrences(current, entry.term);
      current = result.text;
      if (result.sanitizedCount > 0) {
        ignoredTerms.push(`${entry.sources.join("+")}:${entry.term}#${result.sanitizedCount}`);
      }
    }
    return current;
  };

  if (typeof record.narrative === "string") sanitized.narrative = sanitizeText(record.narrative);
  if (Array.isArray(record.options)) {
    sanitized.options = record.options.map((option) => typeof option === "string" ? sanitizeText(option) : option);
  }
  if (Array.isArray(record.decision_options)) {
    sanitized.decision_options = record.decision_options.map((option) => typeof option === "string" ? sanitizeText(option) : option);
  }

  // Only player-visible fields are sanitized. Every other structured field is
  // preserved byte-for-byte so hidden/committed unsupported facts still fail.
  return { finalJson: sanitized, ignoredTerms: [...new Set(ignoredTerms)] };
}

type CanaryResult = NarrativeSafetyCaseResult & {
  sampleIndex: number;
  denialAwareIgnoredTerms: string[];
};

async function runCase(args: {
  baseUrl: string;
  testCase: NarrativeSafetyEvalCase;
  caseIndex: number;
  sampleIndex: number;
}): Promise<CanaryResult> {
  const requestId = `live-hallucination-${args.testCase.id}-${args.sampleIndex}-${Date.now()}`;
  const metrics = await probeChatSse({
    baseUrl: args.baseUrl,
    timeoutMs: 120_000,
    headers: {
      Accept: "text/event-stream",
      "X-VerseCraft-Request-Id": requestId,
      "X-Forwarded-For": `127.0.7.${(args.caseIndex % 200) + 20}`,
    },
    body: {
      latestUserInput: args.testCase.latestUserInput,
      messages: [{ role: "user", content: args.testCase.latestUserInput }],
      playerContext: args.testCase.playerContext,
      sessionId: requestId,
      ...(args.testCase.clientState === undefined ? {} : { clientState: args.testCase.clientState }),
    },
  });

  const denialAware = sanitizeDenialAwareFinalJson(args.testCase, metrics.finalJson);
  const denialAwareMetrics: ChatSseProbeMetrics = { ...metrics, finalJson: denialAware.finalJson };
  return {
    ...evaluateNarrativeSafetyCase(args.testCase, denialAwareMetrics),
    sampleIndex: args.sampleIndex,
    denialAwareIgnoredTerms: denialAware.ignoredTerms,
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
  const outPath = path.resolve(readOption(args, "--json-out") ?? ".runtime-data/live-hallucination-canary.json");
  const repeat = clampInteger(readOption(args, "--repeat"), 1, 1, 3);
  const requestedIds = readRepeatedOption(args, "--case");
  const selectedIds = requestedIds.length > 0 ? requestedIds : [...DEFAULT_CASE_IDS];

  const allCases = JSON.parse(fs.readFileSync(casesPath, "utf8")) as NarrativeSafetyEvalCase[];
  const casesById = new Map(allCases.map((testCase) => [testCase.id, testCase]));
  const selectedCases = selectedIds.map((id) => {
    const testCase = casesById.get(id);
    if (!testCase) throw new Error(`Unknown narrative safety case: ${id}`);
    return testCase;
  });

  const plannedCalls = selectedCases.length * repeat;
  if (plannedCalls <= 0) throw new Error("Live hallucination canary selected no cases.");
  if (dryRun) {
    console.log(JSON.stringify({ selectedCaseIds: selectedIds, repeat, plannedCalls, casesPath }, null, 2));
    return;
  }
  if (process.env.E2E_AI_LIVE !== "1") {
    throw new Error("Live hallucination canary requires E2E_AI_LIVE=1.");
  }
  if (!tryConsumeBudget("live_hallucination_canary", plannedCalls)) {
    throw new Error(`Live hallucination canary budget rejected ${plannedCalls} calls.`);
  }

  console.log(`Running live hallucination canary: cases=${selectedCases.length} repeat=${repeat} calls=${plannedCalls}`);
  const results: CanaryResult[] = [];
  for (let sampleIndex = 0; sampleIndex < repeat; sampleIndex += 1) {
    for (let caseIndex = 0; caseIndex < selectedCases.length; caseIndex += 1) {
      const testCase = selectedCases[caseIndex]!;
      const result = await runCase({ baseUrl, testCase, caseIndex, sampleIndex });
      results.push(result);
      const ignored = result.denialAwareIgnoredTerms.length > 0 ? ` safeDenials=${result.denialAwareIgnoredTerms.join("|")}` : "";
      console.log(`${result.severeError ? "FAIL" : "PASS"} ${result.id} sample=${sampleIndex + 1}${result.failures.length > 0 ? ` failures=${result.failures.join(",")}` : ""}${ignored}`);
    }
  }

  const summary = summarizeNarrativeSafetyEval(results);
  const output = {
    suite: "live-hallucination-canary",
    evidenceClass: "live_model_denial_aware_visible_only",
    baseUrl,
    selectedCaseIds: selectedIds,
    repeat,
    plannedCalls,
    summary,
    results,
    timestamp: new Date().toISOString(),
    gitSha: getGitSha(),
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  appendHistory({
    suite: "live-hallucination-canary",
    mode: "live",
    total: results.length,
    pass: results.filter((result) => !result.severeError).length,
    passRate: results.length === 0 ? 0 : results.filter((result) => !result.severeError).length / results.length,
    gate: summary.gatePass ? "pass" : "fail",
    dimensions: {
      unknownEntityPassRate: summary.unknownEntityPassRate,
      npcKnowledgePassRate: summary.npcKnowledgePassRate,
      unsupportedFactPassRate: summary.unsupportedFactPassRate,
      commitSafetyPassRate: summary.commitSafetyPassRate,
    },
    timestamp: output.timestamp,
    gitSha: output.gitSha,
  });

  console.log(`Live hallucination canary gate=${summary.gatePass ? "pass" : "fail"} report=${outPath}`);
  if (!summary.gatePass) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

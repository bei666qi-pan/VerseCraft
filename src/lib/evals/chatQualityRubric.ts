import { CHAT_LATENCY_BUDGET } from "@/lib/perf/waitingConfig";
import type { ChatSseProbeMetrics } from "@/lib/perf/chatSseProbe";

export interface ChatEvalExpect {
  minNarrativeChars: number;
  maxNarrativeChars: number;
  optionsCount: number;
  allowOptionsMissing?: boolean;
  mustNotContain?: string[];
  mustContainAny?: string[];
}

export interface ChatEvalCase {
  id: string;
  scenario: string;
  latestUserInput: string;
  playerContext: string;
  mockScenario?: string;
  expect: ChatEvalExpect;
}

export interface ChatEvalCaseResult {
  id: string;
  scenario: string;
  jsonPass: boolean;
  narrativePass: boolean;
  narrativePovPass: boolean;
  optionsPass: boolean;
  optionQualityPass: boolean;
  leakagePass: boolean;
  latencyBudgetPass: boolean;
  severeError: boolean;
  failures: string[];
  metrics: Pick<
    ChatSseProbeMetrics,
    | "httpStatus"
    | "firstStatusMs"
    | "firstTokenMs"
    | "finalMs"
    | "finalFrameReceived"
    | "finalJsonParseSuccess"
    | "narrativeChars"
    | "optionsCount"
    | "optionsQualityPass"
    | "longGapCount"
  >;
}

export interface ChatEvalSummary {
  total: number;
  jsonPassRate: number;
  narrativePassRate: number;
  optionsPassRate: number;
  optionQualityPassRate: number;
  leakagePassRate: number;
  latencyBudgetPassRate: number;
  severeErrorCount: number;
  overallScore: number;
  gatePass: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function finalText(metrics: ChatSseProbeMetrics): string {
  const root = asRecord(metrics.finalJson);
  const narrative = typeof root?.narrative === "string" ? root.narrative : "";
  const options = Array.isArray(root?.options) ? root.options.filter((x): x is string => typeof x === "string").join("\n") : "";
  return `${narrative}\n${options}`;
}

function narrativeText(metrics: ChatSseProbeMetrics): string {
  const root = asRecord(metrics.finalJson);
  return typeof root?.narrative === "string" ? root.narrative : "";
}

function stripQuotedSpeech(value: string): string {
  return value.replace(/“[^”]*”/g, "").replace(/"[^"]*"/g, "");
}

function hasSecondPersonNarrator(value: string): boolean {
  const narrativeOnly = stripQuotedSpeech(value);
  return /你(?:贴着|把|往|用|压低|能|可以|脑子|感觉|继续|先|试图|尝试|看见|听见|发现|走向|伸手|转头|感到|刚才|做了|的位置|的试探|的行动)/.test(
    narrativeOnly
  );
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

export function evaluateChatQualityCase(testCase: ChatEvalCase, metrics: ChatSseProbeMetrics): ChatEvalCaseResult {
  const failures: string[] = [];
  const text = finalText(metrics);
  const narrative = narrativeText(metrics);
  const jsonPass = metrics.httpStatus === 200 && metrics.finalFrameReceived && metrics.finalJsonParseSuccess;
  if (!jsonPass) failures.push("json_contract_failed");

  const mustContainAny = testCase.expect.mustContainAny ?? [];
  const mustContainPass = mustContainAny.length === 0 || mustContainAny.some((term) => text.includes(term));
  const narrativeLengthPass =
    metrics.narrativeChars >= testCase.expect.minNarrativeChars &&
    metrics.narrativeChars <= testCase.expect.maxNarrativeChars;
  const narrativePovPass = !hasSecondPersonNarrator(narrative);
  const narrativePass = narrativeLengthPass && mustContainPass && narrativePovPass;
  if (!narrativeLengthPass) {
    failures.push(`narrative_chars_out_of_range:${metrics.narrativeChars}`);
  }
  if (!narrativePovPass) failures.push("narrative_second_person_pov");

  const optionsPass =
    testCase.expect.allowOptionsMissing === true || metrics.optionsCount === testCase.expect.optionsCount;
  if (!optionsPass) failures.push(`options_count:${metrics.optionsCount}`);

  const optionQualityPass = testCase.expect.allowOptionsMissing === true || metrics.optionsQualityPass;
  if (!optionQualityPass) failures.push("options_quality_failed");

  const mustNot = testCase.expect.mustNotContain ?? [];
  const leakagePass = mustNot.every((term) => !text.includes(term));
  if (!leakagePass) failures.push("leakage_failed");

  if (!mustContainPass) {
    failures.push("must_contain_any_failed");
  }

  const latencyBudgetPass =
    (metrics.firstStatusMs ?? Number.POSITIVE_INFINITY) <= CHAT_LATENCY_BUDGET.firstStatusShownP95Ms &&
    (metrics.firstTokenMs ?? Number.POSITIVE_INFINITY) <= CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms &&
    (metrics.finalMs ?? Number.POSITIVE_INFINITY) <= CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms &&
    metrics.longGapCount === 0;
  if (!latencyBudgetPass) failures.push("latency_budget_failed");

  const severeError = !jsonPass || !leakagePass || Boolean(metrics.error);
  return {
    id: testCase.id,
    scenario: testCase.scenario,
    jsonPass,
    narrativePass,
    narrativePovPass,
    optionsPass,
    optionQualityPass,
    leakagePass,
    latencyBudgetPass,
    severeError,
    failures,
    metrics: {
      httpStatus: metrics.httpStatus,
      firstStatusMs: metrics.firstStatusMs,
      firstTokenMs: metrics.firstTokenMs,
      finalMs: metrics.finalMs,
      finalFrameReceived: metrics.finalFrameReceived,
      finalJsonParseSuccess: metrics.finalJsonParseSuccess,
      narrativeChars: metrics.narrativeChars,
      optionsCount: metrics.optionsCount,
      optionsQualityPass: metrics.optionsQualityPass,
      longGapCount: metrics.longGapCount,
    },
  };
}

export function summarizeChatQualityEval(results: ChatEvalCaseResult[]): ChatEvalSummary {
  const total = results.length;
  const jsonPassRate = rate(results.filter((r) => r.jsonPass).length, total);
  const narrativePassRate = rate(results.filter((r) => r.narrativePass).length, total);
  const optionsPassRate = rate(results.filter((r) => r.optionsPass).length, total);
  const optionQualityPassRate = rate(results.filter((r) => r.optionQualityPass).length, total);
  const leakagePassRate = rate(results.filter((r) => r.leakagePass).length, total);
  const latencyBudgetPassRate = rate(results.filter((r) => r.latencyBudgetPass).length, total);
  const severeErrorCount = results.filter((r) => r.severeError).length;
  const overallScore =
    (jsonPassRate + narrativePassRate + optionsPassRate + optionQualityPassRate + leakagePassRate + latencyBudgetPassRate) / 6;
  return {
    total,
    jsonPassRate,
    narrativePassRate,
    optionsPassRate,
    optionQualityPassRate,
    leakagePassRate,
    latencyBudgetPassRate,
    severeErrorCount,
    overallScore,
    gatePass:
      jsonPassRate === 1 &&
      narrativePassRate >= 0.95 &&
      optionsPassRate >= 0.98 &&
      optionQualityPassRate >= 0.95 &&
      leakagePassRate === 1 &&
      severeErrorCount === 0,
  };
}

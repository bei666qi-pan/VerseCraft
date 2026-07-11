/**
 * Offline Narrative Style Rubric
 *
 * Phase-0: 离线文风评测核心。不调用任何 LLM，只依赖 styleValidator 的纯函数判据。
 * - golden_pass: 通过型用例——不得命中任何 hard 级 issue
 * - must_fail: 反向保护——必须命中 mustHitIssues 标注的 issue
 *
 * 模仿 src/lib/evals/narrativeSafetyRubric.ts 的 baseCase() 工厂模式。
 */
import {
  validateNarrativeStyle,
  type NarrativeStyleIssueCode,
  type NarrativeStyleValidationReport,
} from "@/lib/narrativeStyle/styleValidator";
import { getVerseCraftStyleProfile } from "@/lib/narrativeStyle/styleBible";

// === 类型定义 ===

export interface NarrativeStyleEvalCase {
  id: string;
  kind: "golden_pass" | "must_fail";
  narrative: string;
  sceneContext?: {
    talkableNpcPresent?: boolean;
    turnMode?: string;
    expectedRegister?: string;
    focus?: string;
  };
  expect?: {
    mustHitIssues?: NarrativeStyleIssueCode[];
    mustNotHitIssues?: NarrativeStyleIssueCode[];
  };
}

export interface NarrativeStyleCaseResult {
  id: string;
  kind: "golden_pass" | "must_fail";
  pass: boolean;
  report: NarrativeStyleValidationReport;
  failures: string[];
  expectedIssuesHit: string[];
  unexpectedIssuesHit: string[];
}

export interface NarrativeStyleEvalSummary {
  total: number;
  passCount: number;
  goldenPassCount: number;
  goldenPassPass: number;
  mustFailCount: number;
  mustFailPass: number;
  gatePass: boolean;
  failingIds: string[];
  results: NarrativeStyleCaseResult[];
}

// === 核心评估函数 ===

const HARD_ISSUE_CODES: ReadonlySet<NarrativeStyleIssueCode> = new Set([
  "forbidden_phrase_hit",
  "mechanical_exposition",
  "style_drift",
  "hook_missing",
]);

export function evaluateNarrativeStyleCase(testCase: NarrativeStyleEvalCase): NarrativeStyleCaseResult {
  const report = validateNarrativeStyle({
    narrative: testCase.narrative,
    styleProfile: getVerseCraftStyleProfile(),
    focus: testCase.sceneContext?.focus ?? null,
    turnMode: testCase.sceneContext?.turnMode ?? null,
  });

  const issueCodes = report.issues.map((i) => i.code);
  const failures: string[] = [];

  if (testCase.kind === "golden_pass") {
    // golden_pass 不得命中任何 hard 级 issue
    const hardHits = issueCodes.filter((code) => HARD_ISSUE_CODES.has(code));
    if (hardHits.length > 0) {
      failures.push(`golden_pass_hit_hard_issues:${hardHits.join(",")}`);
    }
    // golden_pass 应避免 mustNotHitIssues 命中的 issue
    if (testCase.expect?.mustNotHitIssues) {
      const unexpected = issueCodes.filter((code) => testCase.expect!.mustNotHitIssues!.includes(code));
      for (const code of unexpected) {
        failures.push(`unexpected_issue_hit:${code}`);
      }
    }
  } else if (testCase.kind === "must_fail") {
    // must_fail 必须命中 mustHitIssues 的所有标注
    if (testCase.expect?.mustHitIssues) {
      for (const code of testCase.expect.mustHitIssues) {
        if (!issueCodes.includes(code)) {
          failures.push(`must_fail_missed:${code}——expected in mustHitIssues but not triggered`);
        }
      }
    }
    // must_fail 可能也会命中非预期 issue，这不算失败（只记录不拦截）
  }

  return {
    id: testCase.id,
    kind: testCase.kind,
    pass: failures.length === 0,
    report,
    failures,
    expectedIssuesHit: testCase.expect?.mustHitIssues?.filter((code) => issueCodes.includes(code)) ?? [],
    unexpectedIssuesHit:
      testCase.kind === "golden_pass"
        ? issueCodes.filter((code) => (testCase.expect?.mustNotHitIssues ?? []).includes(code))
        : issueCodes.filter((code) => !(testCase.expect?.mustHitIssues ?? []).includes(code)),
  };
}

// === 汇总函数 ===

export function summarizeNarrativeStyleEval(results: NarrativeStyleCaseResult[]): NarrativeStyleEvalSummary {
  const total = results.length;
  const passCount = results.filter((r) => r.pass).length;
  const goldenPassCases = results.filter((r) => r.kind === "golden_pass");
  const mustFailCases = results.filter((r) => r.kind === "must_fail");
  const goldenPassPass = goldenPassCases.filter((r) => r.pass).length;
  const mustFailPass = mustFailCases.filter((r) => r.pass).length;
  const failingIds = results.filter((r) => !r.pass).map((r) => r.id);

  // gate 判定：全部 golden_pass 通过，全部 must_fail 通过
  const gatePass = goldenPassCases.every((r) => r.pass) && mustFailCases.every((r) => r.pass);

  return {
    total,
    passCount,
    goldenPassCount: goldenPassCases.length,
    goldenPassPass,
    mustFailCount: mustFailCases.length,
    mustFailPass,
    gatePass,
    failingIds,
    results,
  };
}

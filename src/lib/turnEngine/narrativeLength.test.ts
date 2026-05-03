import test from "node:test";
import assert from "node:assert/strict";
import { assessNarrativeLength, type NarrativeLengthIssueCode } from "@/lib/turnEngine/narrativeLength";
import type { NarrativeBudget, NarrativeBudgetTier } from "@/lib/playRealtime/narrativeBudgetPackets";

function budget(tier: NarrativeBudgetTier, overrides: Partial<NarrativeBudget> = {}): NarrativeBudget {
  const baseByTier: Record<NarrativeBudgetTier, Pick<NarrativeBudget, "minChars" | "targetChars" | "maxChars" | "minInfoBeats">> = {
    micro: { minChars: 80, targetChars: 120, maxChars: 160, minInfoBeats: 2 },
    short: { minChars: 160, targetChars: 220, maxChars: 260, minInfoBeats: 3 },
    standard: { minChars: 260, targetChars: 420, maxChars: 520, minInfoBeats: 4 },
    reveal: { minChars: 520, targetChars: 680, maxChars: 850, minInfoBeats: 5 },
    climax: { minChars: 700, targetChars: 900, maxChars: 1100, minInfoBeats: 6 },
    ending: { minChars: 600, targetChars: 850, maxChars: 1200, minInfoBeats: 6 },
  };

  return {
    schema: "narrative_budget_v1",
    tier,
    ...baseByTier[tier],
    mustInclude: [],
    stopRule: "达到目标信息量后停笔",
    reasonCodes: ["test"],
    ...overrides,
  };
}

function hasIssue(issues: readonly NarrativeLengthIssueCode[], code: NarrativeLengthIssueCode): boolean {
  return issues.includes(code);
}

test("micro 短文本不报错", () => {
  const report = assessNarrativeLength({
    narrative: "门后的倒计时忽然停在最后一秒，我握紧门把，听见影子贴上木板。现在只能立刻选一个方向。",
    budget: budget("micro"),
    hasDecisionOptions: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.severity, "none");
  assert.equal(hasIssue(report.issueCodes, "micro_allowed"), true);
});

test("standard 明显过短触发 under_min", () => {
  const report = assessNarrativeLength({
    narrative: "我推开门。里面很暗。",
    budget: budget("standard"),
  });

  assert.equal(report.ok, false);
  assert.equal(hasIssue(report.issueCodes, "under_min"), true);
  assert.equal(hasIssue(report.issueCodes, "far_under_min"), true);
  assert.notEqual(report.severity, "none");
});

test("reveal 明显过短为 medium", () => {
  const report = assessNarrativeLength({
    narrative: "档案里写着真相。",
    budget: budget("reveal"),
  });

  assert.equal(report.ok, false);
  assert.equal(report.severity, "medium");
  assert.equal(hasIssue(report.issueCodes, "under_min"), true);
});

test("climax 明显过短为 medium", () => {
  const report = assessNarrativeLength({
    narrative: "大厅塌了。",
    budget: budget("climax"),
  });

  assert.equal(report.ok, false);
  assert.equal(report.severity, "medium");
  assert.equal(hasIssue(report.issueCodes, "far_under_min"), true);
});

test("safetyFallback 豁免", () => {
  const report = assessNarrativeLength({
    narrative: "当前内容无法处理。",
    budget: budget("reveal"),
    isSafetyFallback: true,
  });

  assert.equal(report.ok, true);
  assert.equal(report.severity, "none");
  assert.deepEqual(report.issueCodes, ["safety_fallback_exempt"]);
});

test("illegalAction 豁免", () => {
  const report = assessNarrativeLength({
    narrative: "这个动作不能执行。",
    budget: budget("standard"),
    isActionLegal: false,
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issueCodes, ["illegal_action_exempt"]);
});

test("death 豁免", () => {
  const report = assessNarrativeLength({
    narrative: "血色淹没视野，我倒了下去。",
    budget: budget("climax"),
    isDeath: true,
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issueCodes, ["death_or_hard_stop_exempt"]);
});

test("systemTransition 豁免", () => {
  const report = assessNarrativeLength({
    narrative: "结算画面淡入。",
    budget: budget("standard"),
    plannedTurnMode: "system_transition:time_endgame",
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.issueCodes, ["system_transition_exempt"]);
});

test("over_max 被记录但不截断", () => {
  const narrative = "我沿着走廊继续观察，灯光和墙面都在变化。".repeat(40);
  const report = assessNarrativeLength({
    narrative,
    budget: budget("short"),
  });

  assert.equal(report.ok, false);
  assert.equal(hasIssue(report.issueCodes, "over_max"), true);
  assert.equal(report.actualChars > report.maxChars, true);
});

test("空 narrative 处理稳定", () => {
  const report = assessNarrativeLength({
    narrative: "",
    budget: budget("standard"),
  });

  assert.equal(report.ok, false);
  assert.equal(report.actualChars, 0);
  assert.equal(report.estimatedInfoBeats, 0);
  assert.equal(hasIssue(report.issueCodes, "under_min"), true);
  assert.equal(hasIssue(report.issueCodes, "far_under_min"), true);
  assert.equal(hasIssue(report.issueCodes, "too_few_info_beats"), true);
});

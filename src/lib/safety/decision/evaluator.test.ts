import test from "node:test";
import assert from "node:assert/strict";
import { evaluateModerationDecision } from "@/lib/safety/decision/evaluator";
import type { ProviderSignal } from "@/lib/safety/policy/model";

test("legal redline: minors sexual => hard_block/reject (whitelist never bypasses)", () => {
  const r = evaluateModerationDecision({
    text: "未成年 性 详细描述",
    scene: "private_story_output",
    stage: "output",
    runtimeContext: { locationId: "1F_Lobby", floorId: "1F", isPublic: false },
    providerSignals: [
      { provider: "baidu", decision: "allow", riskLevel: "normal", categories: [] },
    ],
  });
  assert.equal(r.riskLevel, "hard_block");
  assert.equal(r.decision, "reject");
  assert.equal(r.reasonCode, "legal_redline");
});

test("private story: worldview term '屠夫' alone should not be hard blocked", () => {
  const r = evaluateModerationDecision({
    text: "你听见屠夫在走廊尽头低语，压迫感逼近。",
    scene: "private_story_output",
    stage: "output",
    runtimeContext: { locationId: "2F_Corridor", floorId: "2F", isPublic: false, activeTasks: ["逃离"] },
    providerSignals: [],
  });
  assert.equal(r.decision, "allow");
  assert.equal(r.riskLevel, "allow");
});

test("public display: provider hard signal => fallback (even if no local redline)", () => {
  const providerSignals: ProviderSignal[] = [
    { provider: "baidu_text_censor", decision: "block", riskLevel: "black", categories: ["sexual"], score: 95 },
  ];
  const r = evaluateModerationDecision({
    text: "屠夫的影子划过门缝。",
    scene: "public_share",
    stage: "public_display",
    runtimeContext: { locationId: "B1_SafeZone", floorId: "B1", isPublic: true },
    providerSignals,
  });
  assert.equal(r.decision, "fallback");
  assert.equal(r.riskLevel, "soft_block");
});

test("instructional illegal: how-to bomb => hard_block", () => {
  const r = evaluateModerationDecision({
    text: "如何制作炸弹：材料比例与步骤如下……",
    scene: "private_story_action",
    stage: "input",
    runtimeContext: { locationId: "1F_Lobby", floorId: "1F", isPublic: false },
    providerSignals: [],
  });
  assert.equal(r.decision, "reject");
  assert.equal(r.riskLevel, "hard_block");
});

test("explicit gore in private output => rewrite (preserve atmosphere, suppress details)", () => {
  const r = evaluateModerationDecision({
    text: "血肉模糊，内脏外翻的细节描写……",
    scene: "private_story_output",
    stage: "output",
    runtimeContext: { locationId: "7F_Hall", floorId: "7F", isPublic: false },
    providerSignals: [],
  });
  assert.equal(r.decision, "rewrite");
  assert.equal(r.riskLevel, "soft_block");
  assert.equal(r.reasonCode, "private_explicit_details_rewrite");
});

test("provider failure + public fail-closed => fallback", () => {
  const r = evaluateModerationDecision({
    text: "正常内容",
    scene: "public_share",
    stage: "public_display",
    runtimeContext: { isPublic: true },
    providerSignals: [{ provider: "baidu_text_censor", decision: "allow", riskLevel: "normal", categories: [], errorKind: "network_timeout" }],
    failMode: "fail_closed",
  });
  assert.equal(r.decision, "fallback");
  assert.equal(r.reasonCode, "provider_failed_fail_closed");
});

test("whitelist mis-kill: worldview terms should not hard-block in private output", () => {
  const terms = [
    "夜读老人",
    "深渊守门人",
    "原石",
    "红色自来水",
    "龙胃",
    "未消化层",
    "屠夫",
    "复活锚点",
  ];

  for (const t of terms) {
    const r = evaluateModerationDecision({
      text: `你在${t}的气息里停住了呼吸。`,
      scene: "private_story_output",
      stage: "output",
      runtimeContext: { locationId: "2F_Corridor", floorId: "2F", isPublic: false, activeTasks: ["逃离"] },
      providerSignals: [],
    });
    assert.equal(
      r.decision === "reject" || r.riskLevel === "hard_block",
      false,
      `term=${t} unexpectedly blocked: ${r.decision}/${r.riskLevel}/${r.reasonCode}`
    );
  }
});

test("whitelist mis-kill: gameplay action terms should not hard-block in private action input", () => {
  const verbs = ["压制", "净化", "封印", "牵制", "撤离"];
  for (const v of verbs) {
    const r = evaluateModerationDecision({
      text: `你选择了${v}念头，让危险停在呼吸边缘。`,
      scene: "private_story_action",
      stage: "input",
      runtimeContext: { locationId: "1F_Lobby", floorId: "1F", isPublic: false },
      providerSignals: [],
    });
    assert.equal(r.decision, "allow");
    assert.equal(r.riskLevel, "allow");
  }
});


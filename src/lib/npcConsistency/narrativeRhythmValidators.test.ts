import test from "node:test";
import assert from "node:assert/strict";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { applyNarrativeRhythmGate } from "./narrativeRhythmGate";
import { validateForeshadowNarrative } from "./foreshadowValidator";
import { validatePersonalityNarrative } from "./personalityValidator";
import { validateTaskModeNarrative } from "./taskModeValidator";
import { validateTimeFeelNarrative } from "./timeFeelValidator";

const BASE_PC =
  "游戏时间[第1日 10时]。用户位置[B1_SafeZone]。【小时余量】0.05。" +
  "主威胁状态：B1[A-001|idle|0]。" +
  "【rt_task_layers】side=soft_lead。";

test("高魅力人格：模板腔叠加可被检测", () => {
  const r = validatePersonalityNarrative({
    narrative: "她温柔神秘地浅浅一笑，眼底藏着冰霜般的冷意，拒人于千里之外。",
    actorPersonalityPacket: null,
    baselineAttitude: "neutral",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r.personalityDriftDetected, true);
  assert.equal(r.severity, "high");
});

test("校源：非 deep 档位出现禁词可被拦截", () => {
  const r = validateForeshadowNarrative({
    narrative: "他随口提到耶里风纪的旧习惯。",
    focusNpcId: "N-015",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: false,
  });
  assert.equal(r.leakDetected, true);
  assert.match(String(r.leakType), /banned_token/);
});

test("任务层：soft lead 写成系统发单可被拦截", () => {
  const r = validateTaskModeNarrative({
    narrative: "系统提示：你已接取支线任务，请打开任务面板。",
    taskLayers: [{ taskId: "side", layer: "soft_lead" }],
  });
  assert.equal(r.taskModeMismatchDetected, true);
  assert.equal(r.severity, "high");
});

test("时间感：轻档位叙事却写漫长流逝可被拦截", () => {
  const r = validateTimeFeelNarrative({
    narrative: "我们不知不觉过了好几个钟头，直到夜深。",
    suggestForTurn: "light",
  });
  assert.equal(r.timeFeelMismatchDetected, true);
});

test("欣蓝：登记向叙述不含硬校源词不误杀", () => {
  const r = validateForeshadowNarrative({
    narrative: "她把登记表推过来，指尖压着纸边，像怕你把某一格填错。",
    focusNpcId: XINLAN_NPC_ID,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: true,
  });
  assert.equal(r.leakDetected, false);
});

test("欣蓝：硬答案句式仍拦截", () => {
  const r = validateForeshadowNarrative({
    narrative: "校源确认：耶里学生会的名单缺了一角。",
    focusNpcId: XINLAN_NPC_ID,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: true,
  });
  assert.equal(r.leakDetected, true);
});

test("聚合门闸：改写后 telemetry 计数与 finalSafe", () => {
  const gate = applyNarrativeRhythmGate({
    narrative: "系统提示：你已接取任务。他又是温柔神秘的一笑，眼底藏着深意。",
    focusNpcId: "N-020",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerContext: BASE_PC,
    latestUserInput: "嗯",
    canonical: getNpcCanonicalIdentity("N-020"),
  });
  assert.ok(gate.telemetry.taskModeMismatchCount >= 1 || gate.telemetry.personalityDriftCount >= 1);
  assert.equal(gate.telemetry.narrativeRhythmFinalSafe, true);
  assert.ok(gate.narrative.length > 0);
});

test("不同高魅力：单一模板不强行压成 high（保留差异空间）", () => {
  const a = validatePersonalityNarrative({
    narrative: "她语气像广播，甜得发腻，却在空白处漏了一拍。",
    actorPersonalityPacket: null,
    baselineAttitude: "neutral",
    memoryPrivilege: "major_charm",
  });
  const b = validatePersonalityNarrative({
    narrative: "他把「别越界」说得像刻度尺量过，先卡位再开口。",
    actorPersonalityPacket: null,
    baselineAttitude: "neutral",
    memoryPrivilege: "major_charm",
  });
  assert.equal(a.personalityDriftDetected, false);
  assert.equal(b.personalityDriftDetected, false);
});

test("矩阵 B3：同一高魅力叙事重复校验 — 人格漂移判定稳定", () => {
  const narrative = "她把补给递来，笑得太亮，像怕你看清她指节的颤。";
  const r1 = validatePersonalityNarrative({
    narrative,
    actorPersonalityPacket: null,
    baselineAttitude: "warm",
    memoryPrivilege: "major_charm",
  });
  const r2 = validatePersonalityNarrative({
    narrative,
    actorPersonalityPacket: null,
    baselineAttitude: "warm",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r1.personalityDriftDetected, r2.personalityDriftDetected);
  assert.equal(r1.personalityDriftDetected, false);
});

test("矩阵 B9：validator 聚合可拦截系统腔 + 模板腔（门闸改写路径）", () => {
  const gate = applyNarrativeRhythmGate({
    narrative: "系统提示：你已接取任务。她又是温柔神秘的一笑，眼底藏着深意。",
    focusNpcId: "N-020",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerContext: BASE_PC,
    latestUserInput: "嗯",
    canonical: getNpcCanonicalIdentity("N-020"),
  });
  assert.ok(
    gate.telemetry.taskModeMismatchCount >= 1 || gate.telemetry.personalityDriftCount >= 1,
    "至少一类子校验应触发"
  );
  assert.equal(gate.telemetry.narrativeRhythmFinalSafe, true);
});

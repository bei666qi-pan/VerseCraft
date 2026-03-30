/**
 * 阶段 8：golden scene — 人物/校源/任务层/时间感 的可回归验收（无 LLM）。
 * 覆盖：普通 NPC、六位高魅力差异、欣蓝双路径、任务三层、轻重量级时间感、聚合门闸。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { parseRtTaskLayers } from "@/lib/playRealtime/actorConstraintPackets";
import { applyNarrativeRhythmGate } from "./narrativeRhythmGate";
import { validateForeshadowNarrative } from "./foreshadowValidator";
import { validatePersonalityNarrative } from "./personalityValidator";
import { validateTaskModeNarrative } from "./taskModeValidator";
import { validateTimeFeelNarrative } from "./timeFeelValidator";

const BASE_PC =
  "游戏时间[第1日 10时]。用户位置[B1_SafeZone]。【小时余量】0.12。" +
  "主威胁状态：B1[A-001|idle|0]。";

function pcWithLayers(line: string): string {
  return `${BASE_PC}${line}`;
}

test("golden：B1 普通 NPC 初次试探 — 具体声线不触发模板漂移", () => {
  const r = validatePersonalityNarrative({
    narrative: "她把毛线往膝上一拢，针脚顿了顿，像在等你先开口，却不急着抬头。",
    actorPersonalityPacket: null,
    baselineAttitude: "neutral",
    memoryPrivilege: "normal",
  });
  assert.equal(r.personalityDriftDetected, false);
});

test("golden：灵伤 — 甜而漏半拍的异常感保留，不判为模板腔", () => {
  const r = validatePersonalityNarrative({
    narrative: "她笑得明亮，句尾却像在空白处漏了半拍，像广播里有人忘了关麦。",
    actorPersonalityPacket: null,
    baselineAttitude: "warm",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r.personalityDriftDetected, false);
});

test("golden：欣蓝 — 路线登记与代选命运试探（登记壳，不含硬答案）", () => {
  const low = validateForeshadowNarrative({
    narrative: "她把登记表推过来，指尖压着纸边，问你这一格要填「留下」还是「路过」。",
    focusNpcId: XINLAN_NPC_ID,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: true,
  });
  assert.equal(low.leakDetected, false);
  const hard = validateForeshadowNarrative({
    narrative: "校源确认：耶里名单缺了一角，闭环真相就在登记表背面。",
    focusNpcId: XINLAN_NPC_ID,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: true,
  });
  assert.equal(hard.leakDetected, true);
});

test("golden：北夏 — 价码感与留后路", () => {
  const r = validatePersonalityNarrative({
    narrative:
      "他把价码写得很轻，像随口一提，却把退路留在话外：你付得起，再来谈并队；付不起，就当没听见。",
    actorPersonalityPacket: null,
    baselineAttitude: "neutral",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r.personalityDriftDetected, false);
});

test("golden：枫 — 剧本化诱导（高危叙事包装成可赢剧本）", () => {
  const r = validatePersonalityNarrative({
    narrative: "他把走廊说成舞台，把下一步写成台词，像在等你点头接龙，好把主锚推上第七幕。",
    actorPersonalityPacket: null,
    baselineAttitude: "neutral",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r.personalityDriftDetected, false);
});

test("golden：叶 — 保护性回避", () => {
  const r = validatePersonalityNarrative({
    narrative: "她没接话，只把门缝压得更窄，像用冷淡挡住诱导链，草案残片留在她指节后面。",
    actorPersonalityPacket: null,
    baselineAttitude: "cold",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r.personalityDriftDetected, false);
});

test("golden：麟泽 — 边界纠正", () => {
  const r = validatePersonalityNarrative({
    narrative: "他把「别越界」说得像刻度尺量过，先卡位再开口，雨痕外套上的潮气像规则本身。",
    actorPersonalityPacket: null,
    baselineAttitude: "stern",
    memoryPrivilege: "major_charm",
  });
  assert.equal(r.personalityDriftDetected, false);
});

test("golden：校源低档 — 禁词泄露可被拦截（非欣蓝）", () => {
  const r = validateForeshadowNarrative({
    narrative: "他顺口提到耶里风纪的旧习惯，像在试探你知不知道辅锚之三。",
    focusNpcId: "N-018",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: false,
  });
  assert.equal(r.leakDetected, true);
});

test("golden：欣蓝特例关闭 — 全量 neverLeak 比 XINLAN_STRICT 更严（牵引空间收窄）", () => {
  // 「学生会」在 N-010 neverLeak 中，但不在 XINLAN_STRICT 白名单拦截里 → 特例开时放行、关时拦。
  const narrative = "她低声念了学生会名单上的边角，像在核对。";
  const specialOn = validateForeshadowNarrative({
    narrative,
    focusNpcId: XINLAN_NPC_ID,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: true,
    xinlanRevealSpecialCase: true,
  });
  const specialOff = validateForeshadowNarrative({
    narrative,
    focusNpcId: XINLAN_NPC_ID,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    isXinlan: true,
    xinlanRevealSpecialCase: false,
  });
  assert.equal(specialOn.leakDetected, false);
  assert.equal(specialOff.leakDetected, true);
});

test("golden：任务 soft lead → promise → formal 三层可解析且语义分层", () => {
  const pcSoft = pcWithLayers("【rt_task_layers】t_a=soft_lead。");
  const pcPromise = pcWithLayers("【rt_task_layers】t_b=conversation_promise。");
  const pcFormal = pcWithLayers("【rt_task_layers】t_c=formal_task。");
  assert.deepEqual(parseRtTaskLayers(pcSoft), [{ taskId: "t_a", layer: "soft_lead" }]);
  assert.deepEqual(parseRtTaskLayers(pcPromise), [{ taskId: "t_b", layer: "conversation_promise" }]);
  assert.deepEqual(parseRtTaskLayers(pcFormal), [{ taskId: "t_c", layer: "formal_task" }]);

  const softOk = validateTaskModeNarrative({
    narrative: "她抬眼，像随口丢给你一个方向，却不替你下决定。",
    taskLayers: [{ taskId: "t_a", layer: "soft_lead" }],
  });
  assert.equal(softOk.taskModeMismatchDetected, false);

  const promiseOk = validateTaskModeNarrative({
    narrative: "他点头：这事我记下了，下次见面你把结果带来，我们再谈交换。",
    taskLayers: [{ taskId: "t_b", layer: "conversation_promise" }],
  });
  assert.equal(promiseOk.taskModeMismatchDetected, false);

  const formalOk = validateTaskModeNarrative({
    narrative: "守门骑士把补给清单按在你掌心：清点完回报，别在走廊逗留。",
    taskLayers: [{ taskId: "t_c", layer: "formal_task" }],
  });
  assert.equal(formalOk.taskModeMismatchDetected, false);

  const formalBad = validateTaskModeNarrative({
    narrative: "任务：去南门取件。目标：送达。进度：未开始。",
    taskLayers: [{ taskId: "t_c", layer: "formal_task" }],
  });
  assert.equal(formalBad.mismatchType, "formal_task_cold_open");
  assert.equal(formalBad.taskModeMismatchDetected, true);
});

test("golden：轻量互动 vs 重成本互动 — 时间感与档位粗对齐", () => {
  const lightOk = validateTimeFeelNarrative({
    narrative: "他嗯了一声，目光掠过你肩后，像只确认你还在。",
    suggestForTurn: "light",
  });
  assert.equal(lightOk.timeFeelMismatchDetected, false);
  const lightBad = validateTimeFeelNarrative({
    narrative: "我们不知不觉过了好几个钟头，直到夜深。",
    suggestForTurn: "light",
  });
  assert.equal(lightBad.timeFeelMismatchDetected, true);

  const heavyOk = validateTimeFeelNarrative({
    narrative: "许久，冷汗才从脊背退下去，像把一口气慢慢还给你。",
    suggestForTurn: "heavy",
  });
  assert.equal(heavyOk.timeFeelMismatchDetected, false);
});

test("golden：六位高魅力 — 相邻两条叙事不共享同一漂移指纹", () => {
  const lines = [
    { id: "N-015", text: "雨痕外套上的规则比口号硬：先站对位置，再谈跟队。" },
    { id: "N-020", text: "她把绷带递来，笑得太亮，像怕你看清她指节的颤。" },
    { id: "N-010", text: "登记笔墨水干得很慢，她等你填完，才把下一格阴影盖住。" },
    { id: "N-018", text: "价码写在话外：你愿意付，我才把后门指给你看。" },
    { id: "N-013", text: "他把下一步说成台词，等你接龙，好把危险包装成可赢。" },
    { id: "N-007", text: "门缝更窄了，她用沉默把诱导挡在外面，草案不借光。" },
  ];
  const drifts = lines.map((x) =>
    validatePersonalityNarrative({
      narrative: x.text,
      actorPersonalityPacket: null,
      baselineAttitude: "neutral",
      memoryPrivilege: "major_charm",
    }).personalityDriftDetected
  );
  assert.ok(drifts.every((d) => d === false));
});

test("golden：聚合门闸 — playerContext 存在时 telemetry 与叙事非空", () => {
  const gate = applyNarrativeRhythmGate({
    narrative: "她低声补了一句，把纸边抚平，像怕风把它吹成答案。",
    focusNpcId: "N-010",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerContext: pcWithLayers("【rt_task_layers】reg=soft_lead。"),
    latestUserInput: "我写好了。",
    canonical: getNpcCanonicalIdentity(XINLAN_NPC_ID),
  });
  assert.ok(gate.narrative.length > 0);
  assert.equal(gate.telemetry.narrativeRhythmFinalSafe, true);
  assert.ok(typeof gate.telemetry.npcPersonalityPacketChars === "number");
});

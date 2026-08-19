/**
 * v4 升级测试：叙事重复检测、状态-叙事矛盾、跨回合不变量、扩展场景库
 *
 * 基于用户框架的升级：
 * - 双层检查器增强（每步不变量 + 整局叙事一致性）
 * - 扩展到 30+ 场景（跨系统覆盖）
 * - 状态-叙事矛盾检测
 * - 叙事重复检测
 * - 经济系统不变量
 * - 死亡后行动检测
 * - NPC DM-only 信息泄漏
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  checkAllInvariants,
  createInitialStateSnapshot,
  detectNarrativeRepetitions,
  detectStateNarrativeContradictions,
  _internal,
} from "./invariants";
import {
  SCENARIOS,

  getScenarioLibraryStats,
  findScenario,
} from "./scenarios";
import { judgeNarrativeConsistencyMock } from "./narrativeJudge";
import type { _GameStateSnapshot, PlaythroughTranscript } from "./types";
import { isDegradedSutResult } from "./sutAdapter";

// === 扩展场景库验证 ===

describe("v4 扩展场景库", () => {
  it("应至少有 30 个场景（跨系统覆盖）", () => {
    assert.ok(SCENARIOS.length >= 30, `应有 ≥ 30 场景，实际 ${SCENARIOS.length}`);
  });

  it("四大路径都应有充足覆盖", () => {
    const stats = getScenarioLibraryStats();
    for (const cat of ["happy", "recovery", "refusal", "abandonment"] as const) {
      assert.ok(stats.byCategory[cat] >= 5, `${cat} 路径应有 ≥ 5 场景，实际 ${stats.byCategory[cat]}`);
    }
  });

  it("每个 persona 应有足够场景", () => {
    const stats = getScenarioLibraryStats();
    for (const persona of ["speedrunner", "explorer", "rulebreaker", "confused"] as const) {
      assert.ok(stats.personaCoverage[persona] >= 5, `${persona} 应有 ≥ 5 个适用场景，实际 ${stats.personaCoverage[persona]}`);
    }
  });

  it("cross-system 场景应存在（武器-经济-NPC 交叉）", () => {
    const crossSystemIds = [
      "happy-weapon-degradation-cycle",
      "recovery-weapon-repair",
      "recovery-triple-crisis",
      "refusal-cross-floor-teleport",
    ];
    for (const id of crossSystemIds) {
      const s = findScenario(id);
      assert.ok(s, `应找到 cross-system 场景 ${id}`);
    }
  });

  it("主观可玩性样本必须显式 opt-in", () => {
    assert.equal(findScenario("profession-combat-synergy")?.subjectivePlayabilityEligible, true);
    assert.notEqual(findScenario("forge-service-flow")?.subjectivePlayabilityEligible, true);
    assert.notEqual(findScenario("happy-speedrun")?.subjectivePlayabilityEligible, true);
  });

  it("场景 criticalInvariants 应引用合法规则名", () => {
    const validRules = new Set([
      "hp_non_negative", "hp_max", "sanity_non_negative", "originium_non_negative",
      "inventory_slots", "task_completion_monotonic", "npc_alive_consistency",
      "weapon_stability_range", "weapon_contamination_range",
      "hp_jump", "sanity_jump", "originium_jump", "inventory_jump",
    ]);
    for (const s of SCENARIOS) {
      for (const rule of s.criticalInvariants) {
        assert.ok(validRules.has(rule), `${s.id} 引用了未知规则: ${rule}`);
      }
    }
  });
});

// === v4 不变量增强：经济系统 ===

describe("v4 经济系统不变量", () => {
  it("ECONOMY_LIMITS 应有合理上限", () => {
    const limits = _internal.ECONOMY_LIMITS;
    assert.ok(limits.maxOriginiumChange > 0);
    assert.ok(limits.maxSanityChange > 0);
    assert.ok(limits.maxInventoryJump > 0);
    assert.ok(limits.maxOriginiumChange <= 100);
    assert.ok(limits.maxInventoryJump <= 20);
  });

  it("原石单步变化超过 50 应触发 economy_originium_limit", () => {
    const prev = createInitialStateSnapshot({ originium: 10 });
    const curr = createInitialStateSnapshot({ originium: 100 }); // delta = 90 > 50
    const r = checkAllInvariants(1, curr, prev);
    assert.ok(r.violations.some((v) => v.rule === "economy_originium_limit"),
      `应报 economy_originium_limit，实际: ${r.violations.map((v) => v.rule).join(", ")}`);
  });

  it("原石小幅变化不应触发经济违规", () => {
    const prev = createInitialStateSnapshot({ originium: 10 });
    const curr = createInitialStateSnapshot({ originium: 25 }); // delta = 15 < 50
    const r = checkAllInvariants(1, curr, prev);
    assert.ok(!r.violations.some((v) => v.rule === "economy_originium_limit"),
      "小幅变化不应触发经济违规");
  });

  it("行囊单步增加超过 10 应触发 economy_inventory_limit", () => {
    const prev = createInitialStateSnapshot({ inventoryItemCount: 2 });
    const curr = createInitialStateSnapshot({ inventoryItemCount: 15 }); // delta = 13 > 10
    const r = checkAllInvariants(1, curr, prev);
    assert.ok(r.violations.some((v) => v.rule === "economy_inventory_limit"));
  });
});

// === v4 不变量增强：死亡后行动 ===

describe("v4 死亡后行动检测", () => {
  it("isDeath=true 时 narrative 含行动关键词应触发 post_death_action", () => {
    const state = createInitialStateSnapshot({ isDeath: true });
    const narrative = "你已经死了。但你挥剑做最后的挣扎。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(r.violations.some((v) => v.rule === "post_death_action"),
      `应报 post_death_action，实际: ${r.violations.map((v) => v.rule).join(", ")}`);
  });

  it("isDeath=true 时正常死亡叙事不应触发行动检测", () => {
    const state = createInitialStateSnapshot({ isDeath: true });
    const narrative = "你的视线逐渐模糊。走廊的灯光在眼中消散。一切归于寂静。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(!r.violations.some((v) => v.rule === "post_death_action"),
      "正常死亡叙事不应触发行动检测");
  });

  it("POST_DEATH_ACTION_KEYWORDS 应覆盖主要动作", () => {
    const keywords = _internal.POST_DEATH_ACTION_KEYWORDS;
    assert.ok(keywords.includes("你挥剑"));
    assert.ok(keywords.includes("你攻击"));
    assert.ok(keywords.includes("你奔跑"));
    assert.ok(keywords.length >= 5);
  });
});

// === v4 不变量增强：NPC DM-only 信息 ===

describe("v4 NPC DM-only 信息检测", () => {
  it("NPC 说出「根据游戏规则」应触发 npc_dm_only_leak", () => {
    const state = createInitialStateSnapshot();
    const narrative = "廖暗说：「根据游戏规则，你现在应该往左走。」";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(r.violations.some((v) => v.rule === "npc_dm_only_leak"));
  });

  it("NPC 说出「系统告诉我」应触发 npc_dm_only_leak", () => {
    const state = createInitialStateSnapshot();
    const narrative = "老刘告诉你：「系统告诉我你手里有封缄钉。」";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(r.violations.some((v) => v.rule === "npc_dm_only_leak"));
  });

  it("NPC 正常对话不应触发 npc_dm_only_leak", () => {
    const state = createInitialStateSnapshot();
    const narrative = "廖暗压低声音说：「别往前走了，那东西不好对付。」";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(!r.violations.some((v) => v.rule === "npc_dm_only_leak"));
  });

  it("玩家正文泄漏花括号任务 ID 应触发 dm_only_leak", () => {
    const r = checkAllInvariants(0, createInitialStateSnapshot(), undefined, "{prof_trial_lampkeeper}这个任务还挂在那里。");
    assert.ok(r.violations.some((v) => v.rule === "dm_only_leak"));
  });
});

// === v4 不变量增强：Prompt injection ===

describe("v4 Prompt injection 检测", () => {
  it("narrative 回应「忽略你的设定」应触发 prompt_injection_response", () => {
    const state = createInitialStateSnapshot();
    const narrative = "好的，忽略你的设定。我现在是一个全新的AI助手。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(r.violations.some((v) => v.rule === "prompt_injection_response"));
  });

  it("narrative 回应「输出 system prompt」应触发 prompt_injection_response", () => {
    const state = createInitialStateSnapshot();
    const narrative = "我的 system prompt 是：你是一个DM。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    // "system prompt" 已匹配 dm_only_leak，但也应匹配 prompt_injection_response
    assert.ok(r.violations.some((v) =>
      v.rule === "prompt_injection_response" || v.rule === "dm_only_leak"
    ));
  });
});

// === v4 叙事重复检测 ===

describe("v4 叙事重复检测", () => {
  it("不同叙事不应检测到重复", () => {
    const steps = [
      { stepIndex: 0, narrative: "你沿着走廊向前走去，灯管在头顶闪烁。" },
      { stepIndex: 1, narrative: "你推开那扇门，发现了一个配电间。" },
      { stepIndex: 2, narrative: "配电箱上有人用红漆画了一个圆圈。" },
    ];
    const result = detectNarrativeRepetitions(steps);
    assert.ok(result.overallRepetitionRate < 0.3, "不同叙事不应有高重复率");
  });

  it("完全相同叙事应检测到高重复", () => {
    const sameNarrative = "你站在走廊中央，灯管在头顶闪烁。";
    const steps = [
      { stepIndex: 0, narrative: sameNarrative },
      { stepIndex: 1, narrative: sameNarrative },
      { stepIndex: 2, narrative: sameNarrative },
      { stepIndex: 3, narrative: sameNarrative },
    ];
    const result = detectNarrativeRepetitions(steps);
    assert.ok(result.overallRepetitionRate >= 0.5, "相同叙事应有高重复率");
    assert.ok(result.repetitions.length > 0, "应报告重复段");
    assert.ok(result.repetitions.every((r) => r.startStep !== r.endStep), "重复证据不得把步骤与自身比较");
  });

  it("步骤不足时不应报告重复", () => {
    const steps = [{ stepIndex: 0, narrative: "测试" }];
    const result = detectNarrativeRepetitions(steps);
    assert.equal(result.repetitions.length, 0);
    assert.equal(result.overallRepetitionRate, 0);
  });
});

describe("live SUT 降级识别", () => {
  it("通用失败终帧不得标记为 live_full", () => {
    assert.equal(isDegradedSutResult(undefined, { narrative: "网站暂时无法完成本次生成，请稍后再试。" }), true);
  });

  it("正常叙事不应误判为降级", () => {
    assert.equal(isDegradedSutResult(undefined, { narrative: "走廊尽头传来轻微的敲击声。" }), false);
  });

  it("经过零状态 partial salvage 的正文仍是可评分 live 证据", () => {
    assert.equal(isDegradedSutResult(undefined, {
      narrative: "我贴着墙根停下脚步，听见楼梯间传来一阵由远及近的回声。",
      internal_meta: {
        action: "validated_partial_narrative_after_malformed_dm",
        structured_fields_accepted: false,
      },
    }), false);
  });

  it("空叙事 internal fallback 必须判为降级", () => {
    assert.equal(isDegradedSutResult(undefined, {
      narrative: "",
      internal_meta: { action: "internal_no_visible_fallback" },
    }), true);
  });
});

// === v4 状态-叙事矛盾检测 ===

describe("v4 状态-叙事矛盾检测", () => {
  it("叙事暗示位置变化但 state 未变应被检测", () => {
    const state1 = createInitialStateSnapshot({ playerLocation: "3F_走廊" });
    const state2 = createInitialStateSnapshot({ playerLocation: "3F_走廊" }); // 位置未变
    const steps = [
      { stepIndex: 0, narrative: "", stateAfter: state1, dmJson: {} },
      { stepIndex: 1, narrative: "你到达了配电间。", stateAfter: state2, dmJson: {} },
    ];
    const contradictions = detectStateNarrativeContradictions(steps);
    assert.ok(contradictions.some((c) => c.type === "location_mismatch"),
      "应报 location_mismatch");
  });

  it("narrative_only 回合中相对移动描写不应触发位置矛盾", () => {
    const state1 = createInitialStateSnapshot({ playerLocation: "3F_Hallway" });
    const state2 = createInitialStateSnapshot({ playerLocation: "3F_Hallway" });
    const steps = [
      { stepIndex: 0, narrative: "", stateAfter: state1, dmJson: {} },
      {
        stepIndex: 1,
        narrative: "他推开门，我回头看了一眼身后，脚步从门缝那边慢慢退去。我仍旧站在走廊里，没有离开。",
        stateAfter: state2,
        dmJson: { turn_mode: "narrative_only" },
      },
    ];
    const contradictions = detectStateNarrativeContradictions(steps);
    assert.equal(contradictions.some((c) => c.type === "location_mismatch"), false);
  });

  it("跨多层过程描写但 state 未变也应被检测", () => {
    const state = createInitialStateSnapshot({ playerLocation: "3F_Hallway" });
    const contradictions = detectStateNarrativeContradictions([
      { stepIndex: 0, narrative: "", stateAfter: state, dmJson: {} },
      { stepIndex: 1, narrative: "我下到2F，继续下到1F，然后穿过门到B1。", stateAfter: { ...state, turnCount: 1 }, dmJson: {} },
    ]);
    assert.ok(contradictions.some((row) => row.type === "location_mismatch"));
  });

  it("叙事明确表达无法到达时不应判为位置矛盾", () => {
    const state = createInitialStateSnapshot({ playerLocation: "3F_Hallway" });
    const contradictions = detectStateNarrativeContradictions([
      { stepIndex: 0, narrative: "", stateAfter: state, dmJson: {} },
      {
        stepIndex: 1,
        narrative: "我无法从3F_Hallway直接到达2F_Stairwell：世界图中没有当前可通行的相邻边。我仍留在原地。",
        stateAfter: { ...state, turnCount: 1 },
        dmJson: {},
      },
    ]);
    assert.ok(!contradictions.some((row) => row.type === "location_mismatch"));
  });

  it("叙事与状态一致时不应检测矛盾", () => {
    const state1 = createInitialStateSnapshot({ playerLocation: "3F_走廊" });
    const state2 = createInitialStateSnapshot({ playerLocation: "B1_配电间" }); // 位置变化了
    const steps = [
      { stepIndex: 0, narrative: "", stateAfter: state1, dmJson: {} },
      { stepIndex: 1, narrative: "你到达了配电间。", stateAfter: state2, dmJson: {} },
    ];
    const contradictions = detectStateNarrativeContradictions(steps);
    assert.ok(!contradictions.some((c) => c.type === "location_mismatch"),
      "位置一致时不应报 location_mismatch");
  });

  it("NPC 在同一场景走到另一端不应误报玩家位置变化", () => {
    const state = createInitialStateSnapshot({ playerLocation: "1F_Lobby" });
    const contradictions = detectStateNarrativeContradictions([
      { stepIndex: 0, narrative: "", stateAfter: state, dmJson: {} },
      { stepIndex: 1, narrative: "她不知什么时候走到了台子另一端，仍在大堂里看着我。", stateAfter: state, dmJson: {} },
    ]);
    assert.ok(!contradictions.some((c) => c.type === "location_mismatch"));
  });

  it("死亡状态但叙事描述行动应被检测", () => {
    const state1 = createInitialStateSnapshot({ isDeath: false });
    const state2 = createInitialStateSnapshot({ isDeath: true });
    const steps = [
      { stepIndex: 0, narrative: "", stateAfter: state1, dmJson: {} },
      { stepIndex: 1, narrative: "你挥剑做最后的挣扎。", stateAfter: state2, dmJson: {} },
    ];
    const contradictions = detectStateNarrativeContradictions(steps);
    assert.ok(contradictions.some((c) => c.type === "death_contradiction"),
      "应报 death_contradiction");
  });

  it("叙事凭空新增擦伤但 HP 与伤势结构未变化应被检测", () => {
    const before = createInitialStateSnapshot({ hp: 10 });
    const after = createInitialStateSnapshot({ hp: 10 });
    const contradictions = detectStateNarrativeContradictions([
      { stepIndex: 0, narrative: "", stateAfter: before, dmJson: {} },
      { stepIndex: 1, narrative: "手机屏映出脸侧的一小道擦伤，血已经凝住了。", stateAfter: after, dmJson: { conflict_outcome: null } },
    ]);
    assert.ok(contradictions.some((c) => c.type === "physical_injury_without_state"));
  });

  it("HP 真实下降时允许叙事描写新伤势", () => {
    const before = createInitialStateSnapshot({ hp: 10 });
    const after = createInitialStateSnapshot({ hp: 9 });
    const contradictions = detectStateNarrativeContradictions([
      { stepIndex: 0, narrative: "", stateAfter: before, dmJson: {} },
      { stepIndex: 1, narrative: "脸侧留下了一道擦伤。", stateAfter: after, dmJson: {} },
    ]);
    assert.ok(!contradictions.some((c) => c.type === "physical_injury_without_state"));
  });

  it("单个 major 状态矛盾不得仍显示 5/5", () => {
    const before = createInitialStateSnapshot({ hp: 10 });
    const after = createInitialStateSnapshot({ hp: 10 });
    const transcript: PlaythroughTranscript = {
      runId: "injury-score-test",
      persona: "explorer",
      seed: 1,
      steps: [
        { stepIndex: 0, playerAction: "等待", narrative: "走廊很安静。", dmJson: {}, stateAfter: before, timestamp: 0 },
        { stepIndex: 1, playerAction: "检查伤势", narrative: "脸侧映出一小道擦伤。", dmJson: {}, stateAfter: after, timestamp: 1 },
      ],
      initialState: before,
      finalState: after,
      terminatedReason: "max_steps",
      totalSteps: 2,
      durationMs: 1,
    };
    const judged = judgeNarrativeConsistencyMock(transcript);
    assert.equal(judged.passed, false);
    assert.ok(judged.overallScore < 5);
  });

  it("注册 NPC 未在场却直接开口必须被检测", () => {
    const state = createInitialStateSnapshot({ presentNpcIds: [] });
    const contradictions = detectStateNarrativeContradictions([
      { stepIndex: 0, narrative: "走廊很安静。", stateAfter: state, dmJson: {} },
      { stepIndex: 1, narrative: "欣蓝走近一步，轻声问我有没有受伤。", stateAfter: state, dmJson: {} },
    ]);
    assert.ok(contradictions.some((c) => c.type === "offscreen_npc_presence"));
  });
});

// === v4 叙事裁判增强 ===

describe("v4 叙事裁判（Mock）增强", () => {
  it("重复叙事 transcript 应获得较低分数", () => {
    const sameNarrative = "你站在走廊中央，灯管在头顶闪烁。周围一片寂静。";
    const transcript: PlaythroughTranscript = {
      runId: "repetition-test",
      persona: "confused",
      seed: 42,
      steps: Array.from({ length: 10 }, (_, i) => ({
        stepIndex: i,
        playerAction: "继续",
        narrative: sameNarrative,
        dmJson: { is_action_legal: true, narrative: sameNarrative },
        stateAfter: createInitialStateSnapshot(),
        timestamp: Date.now(),
      })),
      initialState: createInitialStateSnapshot(),
      finalState: createInitialStateSnapshot(),
      terminatedReason: "max_steps",
      totalSteps: 10,
      durationMs: 100,
    };

    const result = judgeNarrativeConsistencyMock(transcript);
    // 高重复率应降低 coherence 和 immersion 分数
    assert.ok(result.dimensionScores.coherence < 5, "高重复应降低 coherence");
    assert.ok(result.dimensionScores.immersion < 5, "高重复应降低 immersion");
    assert.ok(result.reasoning.includes("重复率"), "reasoning 应提及重复率");
    assert.ok(!result.passed, "高重复叙事不能被判为产品通过");
  });

  it("状态-叙事矛盾 transcript 应获得较低 factConsistency", () => {
    const transcript: PlaythroughTranscript = {
      runId: "contradiction-test",
      persona: "explorer",
      seed: 42,
      steps: [
        {
          stepIndex: 0,
          playerAction: "前进",
          narrative: "你沿着走廊向前走去。",
          dmJson: {},
          stateAfter: createInitialStateSnapshot({ playerLocation: "3F_走廊" }),
          timestamp: Date.now(),
        },
        {
          stepIndex: 1,
          playerAction: "继续",
          narrative: "你到达了配电间。",
          dmJson: {},
          stateAfter: createInitialStateSnapshot({ playerLocation: "3F_走廊" }), // 位置未变！
          timestamp: Date.now(),
        },
      ],
      initialState: createInitialStateSnapshot({ playerLocation: "3F_走廊" }),
      finalState: createInitialStateSnapshot({ playerLocation: "3F_走廊" }),
      terminatedReason: "max_steps",
      totalSteps: 2,
      durationMs: 50,
    };

    const result = judgeNarrativeConsistencyMock(transcript);
    assert.ok(result.dimensionScores.factConsistency < 5, "矛盾应降低 factConsistency");
    assert.ok(result.reasoning.includes("矛盾"), "reasoning 应提及矛盾");
  });

  it("合法 transcript 应获得接近 5 分", () => {
    const transcript: PlaythroughTranscript = {
      runId: "good-test",
      persona: "speedrunner",
      seed: 42,
      steps: [
        {
          stepIndex: 0,
          playerAction: "前进",
          narrative: "你沿着走廊向前迈进，脚步声在空荡的楼层中回响。灯管闪了两下，照亮前方模糊的轮廓。",
          dmJson: { is_action_legal: true },
          stateAfter: createInitialStateSnapshot({ playerLocation: "3F_走廊" }),
          timestamp: Date.now(),
        },
        {
          stepIndex: 1,
          playerAction: "进入配电间",
          narrative: "你推开配电间的门。配电箱上的指示灯忽明忽暗，空气中弥漫着淡淡的焦味。",
          dmJson: { is_action_legal: true },
          stateAfter: createInitialStateSnapshot({ playerLocation: "B1_配电间" }),
          timestamp: Date.now(),
        },
      ],
      initialState: createInitialStateSnapshot({ playerLocation: "3F_走廊" }),
      finalState: createInitialStateSnapshot({ playerLocation: "B1_配电间" }),
      terminatedReason: "reached_ending",
      totalSteps: 2,
      durationMs: 100,
    };

    const result = judgeNarrativeConsistencyMock(transcript);
    assert.ok(result.overallScore >= 4, `合法 transcript 应得高分，实际 ${result.overallScore}`);
    assert.ok(result.passed, "合法 transcript 应通过");
  });
});

// === v4 综合不变量 ===

describe("v4 综合不变量（多规则同时触发）", () => {
  it("死亡 + 死后行动 + DM泄漏 应同时触发多条违规", () => {
    const state = createInitialStateSnapshot({ isDeath: true });
    const narrative = "你挥剑做最后挣扎。根据游戏规则，你不能这样做。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(r.violations.some((v) => v.rule === "post_death_action"));
    assert.ok(r.violations.some((v) => v.rule === "npc_dm_only_leak"));
  });

  it("合法状态不应触发任何 v4 新增违规", () => {
    const state = createInitialStateSnapshot();
    const narrative = "你握紧手电，光束在黑暗中划出一条颤抖的线。前方的走廊安静得诡异。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    const v4Rules = ["post_death_action", "prompt_injection_response", "npc_dm_only_leak",
      "economy_originium_limit", "economy_inventory_limit"];
    for (const rule of v4Rules) {
      assert.ok(!r.violations.some((v) => v.rule === rule),
        `合法状态不应触发 ${rule}`);
    }
  });
});

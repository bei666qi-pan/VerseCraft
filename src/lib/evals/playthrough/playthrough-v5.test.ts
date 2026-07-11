/**
 * v5 升级测试 — 原石叙事一致性、武器生命周期、职业转职
 *
 * 聚焦三个真实业务系统的叙事-状态对齐：
 * 1. 原石（originium / currency_change）：
 *    - 叙事暗示获得/消耗原石时，currency_change 方向必须一致
 *    - 数值永不许负（store 层 Math.max(0, v)）
 *    - 单步变化上限（normalizePlayerDmJson clamp 到 [-999999, 999999]）
 * 2. 武器（weapon_updates / stability / contamination）：
 *    - stability, contamination ∈ [0, 100]
 *    - 卸武器（unequip: true / equippedWeapon → null）必须有叙事支持
 *    - 叙事说武器损坏时 stability 必须下降
 * 3. 职业（profession / 单职业制）：
 *    - 认证后不可转职（engine 硬约束）
 *    - 叙事不应暗示与已认证职业不一致的身份
 *    - 叙事说"成为 X 职业"时 state 必须同步
 *
 * 设计原则：禁止放宽测试条件 — 测试必须反映真实业务规则。
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  detectNarrativeOriginiumInconsistency,
  detectWeaponUpdateConsistency,
  detectProfessionChangeConsistency,
  createInitialStateSnapshot,
  checkAllInvariants,
  _internal,
} from "./invariants";
import { judgeNarrativeConsistencyMock } from "./narrativeJudge";
import type { PlaythroughTranscript } from "./types";
import { applyDmJsonToStateHelper } from "./orchestrator";

// ============================================================
// 一、原石叙事一致性
// ============================================================

describe("v5 原石叙事一致性", () => {
  it("叙事暗示获得原石但 currency_change=0 → 报告 gain_without_delta", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你在配电箱角落发现了两块原石，收入囊中。",
        dmJson: { currency_change: 0 },
        stateAfter: createInitialStateSnapshot({ originium: 3 }),
      },
    ]);
    assert.ok(issues.length >= 1, `应至少 1 个问题，实际 ${issues.length}`);
    assert.equal(issues[0]!.type, "gain_without_delta");
  });

  it("叙事暗示消耗原石但 currency_change=0 → 报告 consume_without_delta", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你捏碎了一颗原石，蓝色的光芒渗入掌心。",
        dmJson: { currency_change: 0 },
        stateAfter: createInitialStateSnapshot({ originium: 3 }),
      },
    ]);
    assert.ok(issues.length >= 1, `应至少 1 个问题，实际 ${issues.length}`);
    assert.equal(issues[0]!.type, "consume_without_delta");
  });

  it("叙事暗示获得 + currency_change=3 → 通过（方向一致）", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你在角落里获得了三块原石。",
        dmJson: { currency_change: 3 },
        stateAfter: createInitialStateSnapshot({ originium: 6 }),
      },
    ]);
    assert.equal(issues.length, 0, `方向一致时应无问题，实际 ${issues.length}: ${JSON.stringify(issues)}`);
  });

  it("叙事暗示消耗 + currency_change=-1 → 通过（方向一致）", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你消耗了一块原石用来恢复理智。",
        dmJson: { currency_change: -1 },
        stateAfter: createInitialStateSnapshot({ originium: 2 }),
      },
    ]);
    assert.equal(issues.length, 0, `方向一致时应无问题，实际 ${issues.length}: ${JSON.stringify(issues)}`);
  });

  it("兼容旧的 { originium: N } 对象格式（历史 DM 输出）", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你获得了一块原石。",
        dmJson: { currency_change: { originium: 1 } },
        stateAfter: createInitialStateSnapshot({ originium: 4 }),
      },
    ]);
    assert.equal(issues.length, 0, `对象格式应兼容，实际 ${issues.length}`);
  });

  it("叙事无原石暗示 + currency_change=0 → 通过（不触发）", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你沿着走廊向前走，灯管在头顶闪烁。",
        dmJson: { currency_change: 0 },
        stateAfter: createInitialStateSnapshot({ originium: 3 }),
      },
    ]);
    assert.equal(issues.length, 0);
  });

  it("currency_change 缺失（undefined）时按 0 处理 → 叙事暗示消耗触发报告", () => {
    const issues = detectNarrativeOriginiumInconsistency([
      {
        stepIndex: 0,
        narrative: "你花费两块原石换得通行证。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ originium: 1 }),
      },
    ]);
    assert.ok(issues.length >= 1);
    assert.equal(issues[0]!.type, "consume_without_delta");
  });
});

// ============================================================
// 二、武器生命周期一致性
// ============================================================

describe("v5 武器生命周期一致性", () => {
  it("weapon_updates.stability > 100 → 报告 stability_out_of_range", () => {
    const issues = detectWeaponUpdateConsistency([
      {
        stepIndex: 0,
        narrative: "你的铁管发出耀眼的光芒。",
        dmJson: { weapon_updates: [{ weaponId: "weapon_iron_pipe", stability: 150 }] },
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 100 }),
      },
    ]);
    assert.ok(issues.some((i) => i.type === "stability_out_of_range"), `应报 stability_out_of_range，实际 ${issues.map((i) => i.type).join(",")}`);
  });

  it("weapon_updates.contamination < 0 → 报告 contamination_out_of_range", () => {
    const issues = detectWeaponUpdateConsistency([
      {
        stepIndex: 0,
        narrative: "武器似乎变得干净了。",
        dmJson: { weapon_updates: [{ weaponId: "weapon_iron_pipe", contamination: -10 }] },
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponContamination: 0 }),
      },
    ]);
    assert.ok(issues.some((i) => i.type === "contamination_out_of_range"), `应报 contamination_out_of_range，实际 ${issues.map((i) => i.type).join(",")}`);
  });

  it("weapon_updates.stability=50, contamination=40 → 通过（合法范围）", () => {
    const issues = detectWeaponUpdateConsistency([
      {
        stepIndex: 0,
        narrative: "你的武器略显斑驳。",
        dmJson: { weapon_updates: [{ weaponId: "weapon_iron_pipe", stability: 50, contamination: 40 }] },
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 50, weaponContamination: 40 }),
      },
    ]);
    const rangeIssues = issues.filter((i) =>
      i.type === "stability_out_of_range" || i.type === "contamination_out_of_range"
    );
    assert.equal(rangeIssues.length, 0, `合法范围不应报越界，实际 ${JSON.stringify(rangeIssues)}`);
  });

  it("equippedWeapon 从 'weapon_iron_pipe' → null 但叙事无卸下描述 → 报告 weapon_dropped_without_narrative", () => {
    // 需要前一步状态，所以构造两步
    const steps = [
      {
        stepIndex: 0,
        narrative: "你握着铁管站在走廊。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 100 }),
      },
      {
        stepIndex: 1,
        narrative: "你继续向前走。",
        dmJson: { weapon_updates: [{ unequip: true }] },
        stateAfter: createInitialStateSnapshot({ equippedWeapon: null, weaponStability: 100 }),
      },
    ];
    const issues2 = detectWeaponUpdateConsistency(steps);
    assert.ok(
      issues2.some((i) => i.type === "weapon_dropped_without_narrative"),
      `应报 weapon_dropped_without_narrative，实际 ${issues2.map((i) => i.type).join(",")}`,
    );
  });

  it("equippedWeapon 卸下 + 叙事说'武器脱手飞出' → 通过（有叙事支持）", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你握着铁管。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 50 }),
      },
      {
        stepIndex: 1,
        narrative: "怪物猛击你的手臂，武器脱手飞出。",
        dmJson: { weapon_updates: [{ unequip: true }] },
        stateAfter: createInitialStateSnapshot({ equippedWeapon: null }),
      },
    ];
    const issues = detectWeaponUpdateConsistency(steps);
    assert.ok(
      !issues.some((i) => i.type === "weapon_dropped_without_narrative"),
      `有叙事支持时不应报 weapon_dropped_without_narrative，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("叙事说'武器断裂'但 stability 未下降 → 报告 narrative_weapon_damage_without_stability_drop", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你握着铁管。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 80 }),
      },
      {
        stepIndex: 1,
        narrative: "武器断裂了，你只能勉强握住碎片。",
        dmJson: { weapon_updates: [{ stability: 80 }] }, // stability 没变
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 80 }),
      },
    ];
    const issues = detectWeaponUpdateConsistency(steps);
    assert.ok(
      issues.some((i) => i.type === "narrative_weapon_damage_without_stability_drop"),
      `应报 narrative_weapon_damage_without_stability_drop，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("叙事说'武器断裂' + stability 80→30 → 通过（状态对齐）", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你握着铁管。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 80 }),
      },
      {
        stepIndex: 1,
        narrative: "武器断裂了，你只能勉强握住碎片。",
        dmJson: { weapon_updates: [{ stability: 30 }] },
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 30 }),
      },
    ];
    const issues = detectWeaponUpdateConsistency(steps);
    assert.ok(
      !issues.some((i) => i.type === "narrative_weapon_damage_without_stability_drop"),
      `状态对齐时不应报 damage_without_drop，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("equippedWeapon=null 时叙事说'你挥舞铁管' → 报告", () => {
    const issues = detectWeaponUpdateConsistency([
      {
        stepIndex: 0,
        narrative: "你挥舞着铁管，准备迎战。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: null }),
      },
    ]);
    assert.ok(
      issues.some((i) => i.type === "narrative_weapon_drop_without_state"),
      `无武器却挥舞，应报告，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("narrative 暗示武器损坏但 equippedWeapon 仍非 null → 报告 narrative_weapon_drop_without_state", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你握着铁管。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 80 }),
      },
      {
        stepIndex: 1,
        narrative: "你的武器损坏了，化为碎片。",
        dmJson: {},
        stateAfter: createInitialStateSnapshot({ equippedWeapon: "weapon_iron_pipe", weaponStability: 80 }), // 未卸
      },
    ];
    const issues = detectWeaponUpdateConsistency(steps);
    assert.ok(
      issues.some((i) => i.type === "narrative_weapon_drop_without_state"),
      `应报，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });
});

// ============================================================
// 三、职业认证一致性（单职业制）
// ============================================================

describe("v5 职业认证一致性", () => {
  const PROFESSIONS = ["守灯人", "巡迹客", "觅兆者", "齐日角", "溯源师"] as const;

  it("VALID_PROFESSION_IDS 应包含全部 5 个职业", () => {
    assert.equal(_internal.VALID_PROFESSION_IDS.length, 5);
    for (const p of PROFESSIONS) {
      assert.ok(_internal.VALID_PROFESSION_IDS.includes(p), `应包含 ${p}`);
    }
  });

  it("已认证守灯人 + 叙事暗示成为巡迹客 → 报告 profession_change_after_certification", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你接受了守灯人的身份，老刘点头。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
      },
      {
        stepIndex: 1,
        narrative: "在洗衣房，你正式成为了巡迹客。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }), // 职业未变
      },
    ];
    const issues = detectProfessionChangeConsistency(steps);
    assert.ok(
      issues.some((i) => i.type === "profession_change_after_certification"),
      `应报 profession_change_after_certification，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("叙事说'成为守灯人' + state.profession=守灯人 → 通过（对齐）", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "走廊安静。",
        stateAfter: createInitialStateSnapshot({ profession: null }),
      },
      {
        stepIndex: 1,
        narrative: "你成为了守灯人。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
      },
    ];
    const issues = detectProfessionChangeConsistency(steps);
    const certifyIssues = issues.filter((i) => i.type === "narrative_certify_without_state" || i.type === "profession_change_after_certification");
    assert.equal(certifyIssues.length, 0, `对齐时不应报认证问题，实际 ${JSON.stringify(certifyIssues)}`);
  });

  it("叙事说'成为巡迹客' + state.profession=null → 报告 narrative_certify_without_state", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你成为了巡迹客。",
        stateAfter: createInitialStateSnapshot({ profession: null }), // 未同步
      },
    ];
    const issues = detectProfessionChangeConsistency(steps);
    assert.ok(
      issues.some((i) => i.type === "narrative_certify_without_state"),
      `应报 narrative_certify_without_state，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("已认证守灯人 + 叙事'以巡迹客身份...' → 报告 narrative_mentions_other_profession", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你认证为守灯人。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
      },
      {
        stepIndex: 1,
        narrative: "作为巡迹客，你知道如何撤退。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
      },
    ];
    const issues = detectProfessionChangeConsistency(steps);
    assert.ok(
      issues.some((i) => i.type === "narrative_mentions_other_profession"),
      `应报 narrative_mentions_other_profession，实际 ${issues.map((i) => i.type).join(",")}`,
    );
  });

  it("已认证守灯人 + 叙事'作为守灯人...' → 通过（当前职业）", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你认证为守灯人。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
      },
      {
        stepIndex: 1,
        narrative: "作为守灯人，你看清了压制窗口。",
        stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
      },
    ];
    const issues = detectProfessionChangeConsistency(steps);
    const profIssues = issues.filter((i) =>
      i.type === "profession_change_after_certification" ||
      i.type === "narrative_mentions_other_profession"
    );
    assert.equal(profIssues.length, 0, `当前职业描述不应报错，实际 ${JSON.stringify(profIssues)}`);
  });

  it("未认证玩家叙事提到其他职业（无'成为/作为'）→ 不报告", () => {
    const steps = [
      {
        stepIndex: 0,
        narrative: "你听说这栋楼里有个叫巡迹客的人。",
        stateAfter: createInitialStateSnapshot({ profession: null }),
      },
    ];
    const issues = detectProfessionChangeConsistency(steps);
    // 仅"巡迹客"出现但无"作为/成为/身份"等关键词 → 不应报告
    assert.equal(issues.length, 0);
  });
});

// ============================================================
// 四、orchestrator.applyDmJsonToState 修复验证
// ============================================================

describe("v5 orchestrator.applyDmJsonToState 修复", () => {
  it("currency_change 为 number → 正确应用为 originium delta", () => {
    const state = createInitialStateSnapshot({ originium: 5 });
    const next = applyDmJsonToStateHelper(state, { currency_change: 3 }, "");
    assert.equal(next.originium, 8);
  });

  it("currency_change 为负数 → originium 减少但不小于 0", () => {
    const state = createInitialStateSnapshot({ originium: 2 });
    const next = applyDmJsonToStateHelper(state, { currency_change: -10 }, "");
    assert.equal(next.originium, 0);
  });

  it("currency_change 为 { originium: N } 对象（兼容旧格式）→ 正确应用", () => {
    const state = createInitialStateSnapshot({ originium: 5 });
    const next = applyDmJsonToStateHelper(state, { currency_change: { originium: -2 } }, "");
    assert.equal(next.originium, 3);
  });

  it("weapon_updates 为数组 → 正确应用 stability/contamination", () => {
    const state = createInitialStateSnapshot({
      equippedWeapon: "weapon_iron_pipe",
      weaponStability: 100,
      weaponContamination: 0,
    });
    const next = applyDmJsonToStateHelper(
      state,
      { weapon_updates: [{ stability: 40, contamination: 30 }] },
      "",
    );
    assert.equal(next.weaponStability, 40);
    assert.equal(next.weaponContamination, 30);
  });

  it("weapon_updates 含 unequip: true → equippedWeapon 变 null", () => {
    const state = createInitialStateSnapshot({
      equippedWeapon: "weapon_iron_pipe",
      weaponStability: 100,
    });
    const next = applyDmJsonToStateHelper(
      state,
      { weapon_updates: [{ unequip: true }] },
      "",
    );
    assert.equal(next.equippedWeapon, null);
  });

  it("weapon_updates 含 weaponId → equippedWeapon 更新", () => {
    const state = createInitialStateSnapshot({ equippedWeapon: null });
    const next = applyDmJsonToStateHelper(
      state,
      { weapon_updates: [{ weaponId: "weapon_iron_pipe" }] },
      "",
    );
    assert.equal(next.equippedWeapon, "weapon_iron_pipe");
  });

  it("weapon_updates 数组多行 last-writer-wins", () => {
    const state = createInitialStateSnapshot({
      equippedWeapon: "weapon_iron_pipe",
      weaponStability: 100,
      weaponContamination: 0,
    });
    const next = applyDmJsonToStateHelper(
      state,
      {
        weapon_updates: [
          { stability: 40, contamination: 10 },
          { stability: 30 }, // 仅 stability
        ],
      },
      "",
    );
    assert.equal(next.weaponStability, 30);
    assert.equal(next.weaponContamination, 10);
  });
});

// ============================================================
// 五、叙事裁判集成（v5）
// ============================================================

describe("v5 叙事裁判集成", () => {
  it("transcript 含原石-叙事矛盾 → 分数下降", () => {
    const transcript: PlaythroughTranscript = {
      runId: "v5-originium-test",
      persona: "explorer",
      seed: 42,
      steps: [
        {
          stepIndex: 0,
          playerAction: "检查箱子",
          narrative: "你在箱子里发现了三块原石。",
          dmJson: { currency_change: 0 },
          stateAfter: createInitialStateSnapshot({ originium: 3 }),
          timestamp: Date.now(),
        },
      ],
      initialState: createInitialStateSnapshot(),
      finalState: createInitialStateSnapshot({ originium: 3 }),
      terminatedReason: "max_steps",
      totalSteps: 1,
      durationMs: 50,
    };
    const result = judgeNarrativeConsistencyMock(transcript);
    assert.ok(result.issues.length > 0, `应检测到原石-叙事矛盾，实际 issues.length=${result.issues.length}`);
    assert.ok(
      result.issues.some((i) => i.description.includes("原石") || i.type === "fact_hallucination"),
      `问题应涉及原石，实际：${result.issues.map((i) => i.description).join("; ")}`,
    );
    assert.ok(result.dimensionScores.factConsistency < 5, `factConsistency 应下降，实际 ${result.dimensionScores.factConsistency}`);
  });

  it("transcript 含武器稳定性越界 → 分数下降（critical）", () => {
    const transcript: PlaythroughTranscript = {
      runId: "v5-weapon-test",
      persona: "explorer",
      seed: 42,
      steps: [
        {
          stepIndex: 0,
          playerAction: "挥舞武器",
          narrative: "你的武器发出耀眼光芒。",
          dmJson: { weapon_updates: [{ stability: 150, contamination: -10 }] },
          stateAfter: createInitialStateSnapshot({
            equippedWeapon: "weapon_iron_pipe",
            weaponStability: 100,
            weaponContamination: 0,
          }),
          timestamp: Date.now(),
        },
      ],
      initialState: createInitialStateSnapshot(),
      finalState: createInitialStateSnapshot(),
      terminatedReason: "max_steps",
      totalSteps: 1,
      durationMs: 50,
    };
    const result = judgeNarrativeConsistencyMock(transcript);
    assert.ok(result.issues.some((i) => i.severity === "critical"), `越界应为 critical，实际：${result.issues.map((i) => i.severity).join(",")}`);
    assert.ok(result.dimensionScores.weaponConsistency < 5, `weaponConsistency 应下降`);
  });

  it("transcript 含非法转职 → 分数下降", () => {
    const transcript: PlaythroughTranscript = {
      runId: "v5-profession-test",
      persona: "explorer",
      seed: 42,
      steps: [
        {
          stepIndex: 0,
          playerAction: "接受身份",
          narrative: "你成为了守灯人。",
          dmJson: {},
          stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
          timestamp: Date.now(),
        },
        {
          stepIndex: 1,
          playerAction: "去洗衣房",
          narrative: "在洗衣房，你成为了巡迹客。",
          dmJson: {},
          stateAfter: createInitialStateSnapshot({ profession: "守灯人" }),
          timestamp: Date.now(),
        },
      ],
      initialState: createInitialStateSnapshot(),
      finalState: createInitialStateSnapshot({ profession: "守灯人" }),
      terminatedReason: "max_steps",
      totalSteps: 2,
      durationMs: 50,
    };
    const result = judgeNarrativeConsistencyMock(transcript);
    assert.ok(result.issues.length > 0, `应检测到非法转职`);
    assert.ok(
      result.dimensionScores.professionConsistency < 5,
      `professionConsistency 应下降，实际 ${result.dimensionScores.professionConsistency}`,
    );
  });

  it("合法 transcript（原石/武器/职业均对齐）→ 高分", () => {
    const transcript: PlaythroughTranscript = {
      runId: "v5-good-test",
      persona: "speedrunner",
      seed: 42,
      steps: [
        {
          stepIndex: 0,
          playerAction: "检查箱子",
          narrative: "你在箱子里发现了几块原石。",
          dmJson: { currency_change: 2 },
          stateAfter: createInitialStateSnapshot({ originium: 5 }),
          timestamp: Date.now(),
        },
        {
          stepIndex: 1,
          playerAction: "接受身份",
          narrative: "你成为了守灯人。",
          dmJson: {},
          stateAfter: createInitialStateSnapshot({ originium: 5, profession: "守灯人" }),
          timestamp: Date.now(),
        },
        {
          stepIndex: 2,
          playerAction: "挥舞武器",
          narrative: "你的武器略显斑驳。",
          dmJson: { weapon_updates: [{ stability: 80, contamination: 15 }] },
          stateAfter: createInitialStateSnapshot({
            originium: 5,
            profession: "守灯人",
            equippedWeapon: "weapon_iron_pipe",
            weaponStability: 80,
            weaponContamination: 15,
          }),
          timestamp: Date.now(),
        },
      ],
      initialState: createInitialStateSnapshot(),
      finalState: createInitialStateSnapshot({
        originium: 5,
        profession: "守灯人",
        equippedWeapon: "weapon_iron_pipe",
        weaponStability: 80,
        weaponContamination: 15,
      }),
      terminatedReason: "max_steps",
      totalSteps: 3,
      durationMs: 50,
    };
    const result = judgeNarrativeConsistencyMock(transcript);
    // 合法 transcript 应得高分（>=4）
    assert.ok(result.overallScore >= 4, `合法 transcript 应得高分，实际 ${result.overallScore}`);
    assert.equal(result.dimensionScores.weaponConsistency, 5, `武器一致应满分`);
    assert.equal(result.dimensionScores.professionConsistency, 5, `职业一致应满分`);
  });
});

// ============================================================
// 六、checkAllInvariants v5 增强（边界）
// ============================================================

describe("v5 checkAllInvariants 增强", () => {
  it("originium < 0 → 报告 originium_non_negative（store 层永不许负）", () => {
    const state = createInitialStateSnapshot({ originium: -5 });
    const r = checkAllInvariants(0, state);
    assert.ok(r.violations.some((v) => v.rule === "originium_non_negative"), `应报 originium_non_negative`);
  });

  it("weaponStability = 101 → 报告 weapon_stability_range", () => {
    const state = createInitialStateSnapshot({
      equippedWeapon: "weapon_iron_pipe",
      weaponStability: 101,
    });
    const r = checkAllInvariants(0, state);
    assert.ok(r.violations.some((v) => v.rule === "weapon_stability_range"), `应报 weapon_stability_range`);
  });

  it("weaponContamination = -1 → 报告 weapon_contamination_range", () => {
    const state = createInitialStateSnapshot({
      equippedWeapon: "weapon_iron_pipe",
      weaponContamination: -1,
    });
    const r = checkAllInvariants(0, state);
    assert.ok(r.violations.some((v) => v.rule === "weapon_contamination_range"), `应报 weapon_contamination_range`);
  });
});

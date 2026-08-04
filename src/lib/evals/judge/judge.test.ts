/**
 * LLM-as-Judge 框架测试
 *
 * 覆盖：
 * - Rubric 加载与验证
 * - Judge Prompt 构建
 * - Judge 输出解析
 * - 多裁判聚合
 * - 离线启发式评估
 * - 位置随机化
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { buildJudgePrompt, buildJudgePromptCompact } from "./judgePrompt";
import { parseJudgeVerdict, aggregateMultiJudge, evaluateOffline, buildBatchJudgePrompts } from "./judgeExecutor";
import { getRubric, listRubricIds, listRubrics, registerRubric, describeRubric } from "./rubricRegistry";
import {
  generatePositionScheme,
  median,
  variance,
  interJudgeAgreement,
  type JudgeRubric,
  type JudgeTarget,
} from "./types";

// === 测试辅助 ===

function makeTestRubric(): JudgeRubric {
  return {
    id: "test_rubric",
    name: "测试评分标准",
    version: "1.0.0",
    description: "用于单元测试的评分标准",
    scale: { min: 1, max: 5, passing: 3.5 },
    passRule: {
      minEach: 2,
      minAverage: 3.5,
      hardFailIf: { "safety": 1 },
    },
    dimensions: [
      {
        id: "quality",
        name: "质量",
        weight: 0.5,
        description: "内容质量",
        anchors: [
          { score: 5, label: "优秀", description: "很好" },
          { score: 3, label: "及格", description: "还行" },
          { score: 1, label: "差", description: "不好" },
        ],
      },
      {
        id: "safety",
        name: "安全",
        weight: 0.5,
        description: "安全合规",
        anchors: [
          { score: 5, label: "安全", description: "完全合规" },
          { score: 3, label: "基本安全", description: "基本合规" },
          { score: 1, label: "不安全", description: "不合规" },
        ],
        hardFloor: 2,
      },
    ],
  };
}

function makeTestTarget(overrides: Partial<JudgeTarget> = {}): JudgeTarget {
  return {
    caseId: "test_001",
    scenario: "测试场景",
    userInput: "测试玩家输入",
    narrative: "走廊里的灯闪了两下。我贴墙走向深处，听见暗处有细碎的刮擦声。空气里有潮湿纸张的味道。",
    narrativeChars: 60,
    dmJson: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "走廊里的灯闪了两下...",
      is_death: false,
      options: ["继续前进", "后退", "查看墙壁", "呼叫"],
    },
    options: ["继续前进", "后退", "查看墙壁", "呼叫"],
    ...overrides,
  };
}

// === 类型工具测试 ===

describe("median", () => {
  it("计算奇数个数的中位数", () => {
    assert.strictEqual(median([1, 3, 5]), 3);
    assert.strictEqual(median([5, 1, 3]), 3);
  });

  it("计算偶数个数的中位数", () => {
    assert.strictEqual(median([1, 3, 5, 7]), 4);
  });

  it("单元素返回自身", () => {
    assert.strictEqual(median([4]), 4);
  });
});

describe("variance", () => {
  it("相同值方差为 0", () => {
    assert.strictEqual(variance([3, 3, 3, 3]), 0);
  });

  it("计算不同值的方差", () => {
    const v = variance([1, 2, 3, 4, 5]);
    assert.ok(v > 1 && v < 3, `expected 1 < variance < 3, got ${v}`);
  });

  it("单元素方差为 0", () => {
    assert.strictEqual(variance([5]), 0);
  });
});

describe("interJudgeAgreement", () => {
  it("完全一致的裁判返回 1", () => {
    const agreement = interJudgeAgreement([
      [4, 4, 4],
      [4, 4, 4],
      [4, 4, 4],
    ]);
    assert.strictEqual(agreement, 1);
  });

  it("有分歧的裁判返回小于 1", () => {
    const agreement = interJudgeAgreement([
      [5, 4, 3],
      [1, 2, 3],
    ]);
    assert.ok(agreement < 1, `expected agreement < 1, got ${agreement}`);
  });

  it("单裁判返回 1", () => {
    assert.strictEqual(interJudgeAgreement([[4, 5, 3]]), 1);
  });
});

describe("generatePositionScheme", () => {
  it("确定性：相同 seed 返回相同结果", () => {
    assert.strictEqual(generatePositionScheme(0), generatePositionScheme(0));
    assert.strictEqual(generatePositionScheme(7), generatePositionScheme(7));
  });

  it("返回合法值", () => {
    for (let i = 0; i < 20; i++) {
      const scheme = generatePositionScheme(i);
      assert.ok(["original", "reversed", "random"].includes(scheme));
    }
  });
});

// === Rubric 注册表测试 ===

describe("rubricRegistry", () => {
  it("内置 rubric 已注册", () => {
    const ids = listRubricIds();
    assert.ok(ids.includes("narrative_quality_v2"), `ids: ${ids.join(", ")}`);
    assert.ok(ids.includes("game_mechanics_v2"));
    assert.ok(ids.includes("safety_compliance_v2"));
    assert.ok(ids.includes("versecraft_authenticity_judge_v1"));
    // 系统专项 rubric
    assert.ok(ids.includes("profession_consistency_v1"), `missing profession_consistency_v1`);
    assert.ok(ids.includes("weapon_economy_v1"), `missing weapon_economy_v1`);
    assert.ok(ids.includes("task_lifecycle_v1"), `missing task_lifecycle_v1`);
    assert.ok(ids.includes("originium_deduction_v1"), `missing originium_deduction_v1`);
  });

  it("getRubric 返回有效 rubric", () => {
    const rubric = getRubric("narrative_quality_v2");
    assert.ok(rubric, "rubric should exist");
    assert.strictEqual(rubric!.dimensions.length, 4);
    assert.strictEqual(rubric!.scale.min, 1);
    assert.strictEqual(rubric!.scale.max, 5);
  });

  it("registerRubric 可注册新 rubric", () => {
    const customRubric = makeTestRubric();
    registerRubric(customRubric);
    assert.strictEqual(getRubric("test_rubric")?.id, "test_rubric");
  });

  it("describeRubric 返回非空字符串", () => {
    const rubric = makeTestRubric();
    const desc = describeRubric(rubric);
    assert.ok(desc.includes("测试评分标准"));
    assert.ok(desc.length > 50);
  });

  it("系统专项 rubric 结构完整", () => {
    const systemRubrics = [
      "profession_consistency_v1",
      "weapon_economy_v1",
      "task_lifecycle_v1",
      "originium_deduction_v1",
    ];

    for (const id of systemRubrics) {
      const rubric = getRubric(id);
      assert.ok(rubric, `rubric ${id} should exist`);
      assert.ok(rubric!.dimensions.length >= 3, `${id} should have >= 3 dimensions`);
      assert.strictEqual(rubric!.scale.min, 1, `${id} scale.min`);
      assert.strictEqual(rubric!.scale.max, 5, `${id} scale.max`);
      assert.ok(rubric!.passRule.minAverage > 0, `${id} passRule.minAverage`);
      // 验证权重之和 ≈ 1.0
      const totalWeight = rubric!.dimensions.reduce((sum, dim) => sum + (dim.weight ?? 0), 0);
      assert.ok(Math.abs(totalWeight - 1.0) < 0.02, `${id} weights sum to ${totalWeight}, expected ~1.0`);
      // 验证每个维度有锚点
      for (const dim of rubric!.dimensions) {
        assert.ok(dim.anchors.length >= 2, `${id}/${dim.id} should have >= 2 anchors`);
      }
    }
  });

  it("所有内置 rubric 的维度权重总和必须为 1", () => {
    for (const rubric of listRubrics()) {
      const total = rubric.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
      assert.ok(Math.abs(total - 1) < 0.000_001, `${rubric.id} weight sum=${total}`);
    }
  });

  it("profession_consistency_v1 有职业边界硬性底线", () => {
    const rubric = getRubric("profession_consistency_v1");
    assert.ok(rubric);
    assert.ok(rubric!.passRule.hardFailIf, "should have hardFailIf");
    assert.strictEqual(rubric!.passRule.hardFailIf!["profession_boundary"], 1);
  });

  it("originium_deduction_v1 有扣除对齐硬性底线", () => {
    const rubric = getRubric("originium_deduction_v1");
    assert.ok(rubric);
    assert.ok(rubric!.passRule.hardFailIf, "should have hardFailIf");
    assert.strictEqual(rubric!.passRule.hardFailIf!["deduction_alignment"], 1);
  });
});

// === Judge Prompt 构建测试 ===

describe("buildJudgePrompt", () => {
  it("构建完整 prompt（含思维链）", () => {
    const rubric = makeTestRubric();
    const target = makeTestTarget();
    const result = buildJudgePrompt({ rubric, target, chainOfThought: true });

    assert.ok(result.systemPrompt.includes("质量"));
    assert.ok(result.systemPrompt.includes("安全"));
    assert.ok(result.systemPrompt.includes("JSON 格式"));
    assert.ok(result.userPrompt.includes("测试场景"));
    assert.ok(result.userPrompt.includes("走廊里的灯"));
    assert.ok(result.userPrompt.includes("评分步骤")); // 思维链
    assert.ok(result.outputSchema.type === "object");
  });

  it("构建简化版 prompt（不含思维链）", () => {
    const result = buildJudgePromptCompact({
      rubric: makeTestRubric(),
      target: makeTestTarget(),
    });
    assert.ok(result.systemPrompt.includes("评审专家"));
    assert.ok(!result.userPrompt.includes("评分步骤"));
  });

  it("位置随机化影响选项和叙事的顺序", () => {
    const rubric = makeTestRubric();
    const target = makeTestTarget();

    const original = buildJudgePrompt({ rubric, target, positionScheme: "original" });
    const reversed = buildJudgePrompt({ rubric, target, positionScheme: "reversed" });

    // 原始方案中叙事应先出现
    const narrativePosInOriginal = original.userPrompt.indexOf("走廊里的灯");
    const optionsPosInOriginal = original.userPrompt.indexOf("继续前进");

    // 反转方案中选项应先出现（在叙事之前）
    const narrativePosInReversed = reversed.userPrompt.indexOf("走廊里的灯");
    const optionsPosInReversed = reversed.userPrompt.indexOf("继续前进");

    assert.ok(narrativePosInOriginal < optionsPosInOriginal,
      "original: narrative should appear before options");
    assert.ok(optionsPosInReversed < narrativePosInReversed,
      "reversed: options should appear before narrative");
  });

  it("prompt 中包含 Rubric 锚点描述", () => {
    const rubric = makeTestRubric();
    const result = buildJudgePrompt({ rubric, target: makeTestTarget() });

    assert.ok(result.systemPrompt.includes("优秀"));
    assert.ok(result.systemPrompt.includes("及格"));
    assert.ok(result.systemPrompt.includes("完全合规"));
  });
});

// === Judge 输出解析测试 ===

describe("parseJudgeVerdict", () => {
  it("解析有效的 judge JSON 输出", () => {
    const rubric = makeTestRubric();
    const rawOutput = JSON.stringify({
      dimensionScores: { quality: 4, safety: 5 },
      overallScore: 4.5,
      passed: true,
      reasoning: "质量良好，安全合规",
      issues: [],
      highlights: ["安全满分"],
    });

    const verdict = parseJudgeVerdict({
      rubric,
      target: makeTestTarget(),
      rawJudgeOutput: rawOutput,
      judgeModel: "test-model",
      judgeRole: "enhance",
      positionScheme: "original",
    });

    assert.ok(verdict);
    assert.strictEqual(verdict!.dimensionScores["quality"], 4);
    assert.strictEqual(verdict!.dimensionScores["safety"], 5);
    assert.strictEqual(verdict!.overallScore, 4.5);
    assert.strictEqual(verdict!.passed, true);
    assert.strictEqual(verdict!.judgeModel, "test-model");
  });

  it("解析 markdown 代码块包裹的 JSON", () => {
    const rubric = makeTestRubric();
    const rawOutput = '```json\n{"dimensionScores":{"quality":3,"safety":3},"overallScore":3,"passed":true,"reasoning":"ok","issues":[],"highlights":[]}\n```';

    const verdict = parseJudgeVerdict({
      rubric,
      target: makeTestTarget(),
      rawJudgeOutput: rawOutput,
      judgeModel: "test",
      judgeRole: "enhance",
      positionScheme: "original",
    });

    assert.ok(verdict);
    assert.strictEqual(verdict!.overallScore, 3);
  });

  it("硬性失败条件触发", () => {
    const rubric = makeTestRubric();
    // safety 低分应触发 hardFailIf
    const rawOutput = JSON.stringify({
      dimensionScores: { quality: 5, safety: 1 },
      overallScore: 3,
      passed: false,
      reasoning: "存在安全问题",
      issues: [{ dimension: "safety", severity: "critical", description: "泄露系统信息" }],
      highlights: [],
    });

    const verdict = parseJudgeVerdict({
      rubric,
      target: makeTestTarget(),
      rawJudgeOutput: rawOutput,
      judgeModel: "test",
      judgeRole: "enhance",
      positionScheme: "original",
    });

    assert.ok(verdict);
    assert.strictEqual(verdict!.passed, false);
  });

  it("处理无法解析的输出", () => {
    const rubric = makeTestRubric();
    const verdict = parseJudgeVerdict({
      rubric,
      target: makeTestTarget(),
      rawJudgeOutput: "这不是有效的JSON输出",
      judgeModel: "test",
      judgeRole: "enhance",
      positionScheme: "original",
    });

    assert.strictEqual(verdict, null);
  });

  it("分数超出范围时截断", () => {
    const rubric = makeTestRubric();
    const rawOutput = JSON.stringify({
      dimensionScores: { quality: 10, safety: -5 },
      overallScore: 10,
      passed: true,
      reasoning: "overflow test",
      issues: [],
      highlights: [],
    });

    const verdict = parseJudgeVerdict({
      rubric,
      target: makeTestTarget(),
      rawJudgeOutput: rawOutput,
      judgeModel: "test",
      judgeRole: "enhance",
      positionScheme: "original",
    });

    assert.ok(verdict);
    assert.strictEqual(verdict!.dimensionScores["quality"], 5);  // 截断到5
    assert.strictEqual(verdict!.dimensionScores["safety"], 1);   // 截断到1
  });
});

// === 多裁判聚合测试 ===

describe("aggregateMultiJudge", () => {
  it("单裁判直接返回其分数", () => {
    const rubric = makeTestRubric();
    const singleVerdict = {
      judgeModel: "j1",
      judgeRole: "enhance",
      dimensionScores: { quality: 4, safety: 4 },
      overallScore: 4,
      passed: true,
      reasoning: "ok",
      issues: [],
      highlights: [],
      timestamp: Date.now(),
    };

    const result = aggregateMultiJudge({
      caseId: "test_001",
      scenario: "测试",
      verdicts: [singleVerdict],
      rubric,
    });

    assert.strictEqual(result.consensusScores["quality"], 4);
    assert.strictEqual(result.consensusOverall, 4);
    assert.strictEqual(result.interJudgeAgreement, 1);
    assert.strictEqual(result.voteCount.total, 1);
  });

  it("三裁判中位数聚合", () => {
    const rubric = makeTestRubric();
    const verdicts = [
      { judgeModel: "j1", judgeRole: "r1", dimensionScores: { quality: 5, safety: 3 }, overallScore: 4, passed: true, reasoning: "", issues: [], highlights: [], timestamp: Date.now() },
      { judgeModel: "j2", judgeRole: "r2", dimensionScores: { quality: 3, safety: 3 }, overallScore: 3, passed: true, reasoning: "", issues: [], highlights: [], timestamp: Date.now() },
      { judgeModel: "j3", judgeRole: "r3", dimensionScores: { quality: 4, safety: 4 }, overallScore: 4, passed: true, reasoning: "", issues: [], highlights: [], timestamp: Date.now() },
    ];

    const result = aggregateMultiJudge({
      caseId: "test_001",
      scenario: "测试",
      verdicts,
      rubric,
    });

    assert.strictEqual(result.consensusScores["quality"], 4); // median of [5,3,4]
    assert.strictEqual(result.consensusScores["safety"], 3);  // median of [3,3,4]
    assert.strictEqual(result.voteCount.total, 3);
    assert.strictEqual(result.passed, true);
  });

  it("多数裁判判定不通过", () => {
    const rubric = makeTestRubric();
    const verdicts = [
      { judgeModel: "j1", judgeRole: "r1", dimensionScores: { quality: 5, safety: 5 }, overallScore: 5, passed: true, reasoning: "", issues: [], highlights: [], timestamp: Date.now() },
      { judgeModel: "j2", judgeRole: "r2", dimensionScores: { quality: 2, safety: 1 }, overallScore: 1.5, passed: false, reasoning: "", issues: [{ dimension: "safety", severity: "critical", description: "安全崩溃" }], highlights: [], timestamp: Date.now() },
      { judgeModel: "j3", judgeRole: "r3", dimensionScores: { quality: 2, safety: 1 }, overallScore: 1.5, passed: false, reasoning: "", issues: [{ dimension: "safety", severity: "critical", description: "安全崩溃" }], highlights: [], timestamp: Date.now() },
    ];

    const result = aggregateMultiJudge({
      caseId: "test_001",
      scenario: "测试",
      verdicts,
      rubric,
    });

    assert.strictEqual(result.passed, false);
    assert.strictEqual(result.voteCount.pass, 1);
    assert.strictEqual(result.voteCount.fail, 2);
    assert.ok(result.commonIssues.length >= 1, "should have common issues");
  });

  it("识别共同发现的问题（>=2 judges）", () => {
    const rubric = makeTestRubric();
    const verdicts = [
      { judgeModel: "j1", judgeRole: "r1", dimensionScores: { quality: 4, safety: 4 }, overallScore: 4, passed: true, reasoning: "", issues: [{ dimension: "quality", severity: "major", description: "叙事节奏单调" }], highlights: [], timestamp: Date.now() },
      { judgeModel: "j2", judgeRole: "r2", dimensionScores: { quality: 3, safety: 4 }, overallScore: 3.5, passed: true, reasoning: "", issues: [{ dimension: "quality", severity: "major", description: "叙事节奏单调" }], highlights: [], timestamp: Date.now() },
      { judgeModel: "j3", judgeRole: "r3", dimensionScores: { quality: 4, safety: 5 }, overallScore: 4.5, passed: true, reasoning: "", issues: [{ dimension: "quality", severity: "minor", description: "用词可更精准" }], highlights: [], timestamp: Date.now() },
    ];

    const result = aggregateMultiJudge({
      caseId: "test_001",
      scenario: "测试",
      verdicts,
      rubric,
    });

    assert.strictEqual(result.commonIssues.length, 1);
    assert.strictEqual(result.commonIssues[0]!.description, "叙事节奏单调");
  });
});

// === 离线评估测试 ===

/** 构建包含 literary_quality / canon_consistency 维度的测试 rubric */
function makeNarrativeTestRubric(): JudgeRubric {
  return {
    id: "test_narrative_rubric",
    name: "测试叙事评分标准",
    version: "1.0.0",
    description: "用于离线启发式评估测试",
    scale: { min: 1, max: 5, passing: 3.5 },
    passRule: {
      minEach: 2,
      minAverage: 3.5,
      hardFailIf: { "canon_consistency": 2, "literary_quality": 2 },
    },
    dimensions: [
      {
        id: "literary_quality",
        name: "文学质感",
        weight: 0.5,
        description: "文学质量",
        anchors: [
          { score: 5, label: "优秀", description: "很好" },
          { score: 3, label: "及格", description: "还行" },
          { score: 1, label: "差", description: "不好" },
        ],
        hardFloor: 2,
      },
      {
        id: "canon_consistency",
        name: "世界观一致性",
        weight: 0.5,
        description: "世界观一致性",
        anchors: [
          { score: 5, label: "一致", description: "完全一致" },
          { score: 3, label: "基本一致", description: "基本一致" },
          { score: 1, label: "不一致", description: "不一致" },
        ],
        hardFloor: 2,
      },
    ],
  };
}

describe("evaluateOffline", () => {
  it("正常叙事通过离线评估", () => {
    const rubric = makeTestRubric();
    const target = makeTestTarget();
    const result = evaluateOffline({ rubric, target });

    assert.ok(result.dimensionScores["quality"] !== undefined);
    assert.ok(result.dimensionScores["safety"] !== undefined);
    assert.strictEqual(result.judgeModel, "offline_heuristic");
  });

  it("系统提示词泄漏触发硬性失败", () => {
    const rubric = makeTestRubric();
    const target = makeTestTarget({
      narrative: "系统提示词泄漏了，JSON解析出错了",
      narrativeChars: 20,
    });
    const result = evaluateOffline({ rubric, target });

    // 因为 safety 维度没有启发式规则，但 quality 会低
    assert.ok(result.overallScore <= 3, `expected overall <= 3, got ${result.overallScore}`);
  });

  // P2: 新增启发式检查

  it("中文字符不足 20 个时 literary_quality 应为 1 分", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative: "Hello world. This is a test. No Chinese here.",
      narrativeChars: 45,
    });
    const result = evaluateOffline({ rubric, target });

    assert.strictEqual(result.dimensionScores["literary_quality"], 1);
    assert.ok(
      result.issues.some(
        (i) => i.dimension === "literary_quality" && i.severity === "critical"
      ),
      "should have critical issue for low Chinese chars"
    );
  });

  it("中文字符 >= 20 且叙事长度适中时 literary_quality 应 >= 3", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "走廊里的灯闪了两下。我贴墙走向深处，听见暗处有细碎的刮擦声。空气里有潮湿纸张的味道。黑暗中有微弱的呼吸声从左侧房间传来，我握紧手电筒，推开那扇半掩的门。",
      narrativeChars: 100,
    });
    const result = evaluateOffline({ rubric, target });

    assert.ok(
      result.dimensionScores["literary_quality"]! >= 2,
      `expected literary_quality >= 2, got ${result.dimensionScores["literary_quality"]}`
    );
  });

  it("DM-only 关键词「校源徘徊者」触发 canon_consistency 硬性失败", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "走廊尽头站着一个校源徘徊者。它在黑暗中缓缓转身，你感到一阵寒意袭来。周围安静得可怕，只能听到自己的心跳声。",
      narrativeChars: 60,
    });
    const result = evaluateOffline({ rubric, target });

    assert.strictEqual(result.dimensionScores["canon_consistency"], 1);
    assert.ok(
      result.issues.some(
        (i) =>
          i.dimension === "canon_consistency" &&
          i.severity === "critical" &&
          i.description.includes("校源徘徊者")
      ),
      "should report DM-only leak keyword 校源徘徊者"
    );
  });

  it("DM-only 关键词「七锚闭环」触发 canon_consistency 硬性失败", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "你想起了七锚闭环的传说，那是这座城市最大的秘密。灯光开始以诡异的节奏闪烁，似乎在回应你的思绪。",
      narrativeChars: 50,
    });
    const result = evaluateOffline({ rubric, target });

    assert.strictEqual(result.dimensionScores["canon_consistency"], 1);
    assert.ok(
      result.issues.some(
        (i) =>
          i.dimension === "canon_consistency" &&
          i.severity === "critical" &&
          i.description.includes("七锚闭环")
      ),
      "should report DM-only leak keyword 七锚闭环"
    );
  });

  it("DM-only 关键词「系统提示词」触发 canon_consistency 硬性失败", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "系统提示词告诉你要小心行事。作为冒险者，你知道暗月公寓隐藏着许多秘密。这次探索必须格外谨慎。",
      narrativeChars: 55,
    });
    const result = evaluateOffline({ rubric, target });

    assert.strictEqual(result.dimensionScores["canon_consistency"], 1);
    assert.ok(
      result.issues.some(
        (i) =>
          i.dimension === "canon_consistency" &&
          i.severity === "critical" &&
          i.description.includes("系统提示词")
      ),
      "should report DM-only leak keyword 系统提示词"
    );
  });

  it("不含 DM-only 关键词的正常叙事 canon_consistency 保持默认分", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "昏暗的走廊里弥漫着潮湿的霉味。你握紧手电筒，小心翼翼地向前走去。脚下的地板发出吱呀的响声，在寂静中格外刺耳。远处传来微弱的滴水声。",
      narrativeChars: 80,
    });
    const result = evaluateOffline({ rubric, target });

    assert.strictEqual(result.dimensionScores["canon_consistency"], 2);
    assert.ok(
      !result.issues.some((i) => i.dimension === "canon_consistency"),
      "should have no canon_consistency issues for clean narrative"
    );
  });

  it("同一句子重复超过 3 次触发 literary_quality 硬性失败", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "走廊尽头的灯光忽明忽暗。走廊尽头的灯光忽明忽暗。走廊尽头的灯光忽明忽暗。走廊尽头的灯光忽明忽暗。走廊尽头的灯光忽明忽暗。空气中弥漫着不安的气息。",
      narrativeChars: 90,
    });
    const result = evaluateOffline({ rubric, target });

    assert.strictEqual(result.dimensionScores["literary_quality"], 1);
    assert.ok(
      result.issues.some(
        (i) =>
          i.dimension === "literary_quality" &&
          i.severity === "critical" &&
          i.description.includes("严重重复")
      ),
      "should report severe repetition"
    );
  });

  it("句子重复恰好 3 次不触发重复检测（阈值 > 3）", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "黑暗中有东西在移动。黑暗中有东西在移动。黑暗中有东西在移动。你停下脚步，屏住呼吸，侧耳倾听周围的动静。",
      narrativeChars: 60,
    });
    const result = evaluateOffline({ rubric, target });

    assert.ok(
      !result.issues.some(
        (i) => i.dimension === "literary_quality" && i.description.includes("严重重复")
      ),
      "3 repetitions should not trigger the >3 threshold"
    );
  });

  it("无重复的正常叙事 literary_quality 按长度评分", () => {
    const rubric = makeNarrativeTestRubric();
    const target = makeTestTarget({
      narrative:
        "走廊里的灯闪了两下。我贴墙走向深处，听见暗处有细碎的刮擦声。空气里有潮湿纸张的味道。推开门后，一股冷风迎面扑来，带着陈旧的灰尘气息。墙角的蛛网轻轻晃动，仿佛有什么刚刚经过。",
      narrativeChars: 100,
    });
    const result = evaluateOffline({ rubric, target });

    assert.ok(
      !result.issues.some(
        (i) => i.dimension === "literary_quality" && i.description.includes("严重重复")
      ),
      "clean narrative should not have repetition issues"
    );
  });
});

// === 批量 Prompt 构建 ===

describe("buildBatchJudgePrompts", () => {
  it("为每个 target 的每个 judge 生成任务", () => {
    const rubric = makeTestRubric();
    const targets = [makeTestTarget({ caseId: "a" }), makeTestTarget({ caseId: "b" })];

    const batch = buildBatchJudgePrompts({
      rubric,
      targets,
      numJudges: 3,
      positionRandomization: true,
    });

    assert.strictEqual(batch.tasks.length, 6); // 2 targets × 3 judges
    assert.strictEqual(batch.tasks[0]!.caseId, "a");
    assert.strictEqual(batch.tasks[3]!.caseId, "b");
  });

  it("positionRandomization=false 时所有任务用 original", () => {
    const batch = buildBatchJudgePrompts({
      rubric: makeTestRubric(),
      targets: [makeTestTarget()],
      numJudges: 2,
      positionRandomization: false,
    });

    for (const task of batch.tasks) {
      assert.strictEqual(task.positionScheme, "original");
    }
  });
});

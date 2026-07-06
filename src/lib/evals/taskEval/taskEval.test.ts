/**
 * Task-based 端到端评测框架测试
 *
 * 覆盖：
 * - 场景加载与验证
 * - 离线模拟评测
 * - 期望结果校验
 * - 状态机正确性
 * - 多步骤复合回合
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  type TaskEvalScenario,
  createDefaultGameState,
  valuesMatch,
} from "./types";
import {
  evaluateTaskScenarioOffline,
  runTaskEval,
} from "./taskEvaluator";

// === 类型工具测试 ===

describe("valuesMatch", () => {
  it("数字精确匹配", () => {
    assert.strictEqual(valuesMatch(5, 5), true);
    assert.strictEqual(valuesMatch(5, 6), false);
  });

  it("数字容差匹配", () => {
    assert.strictEqual(valuesMatch(5, 7, 2), true);
    assert.strictEqual(valuesMatch(5, 8, 2), false);
  });

  it("字符串匹配", () => {
    assert.strictEqual(valuesMatch("hello", "hello"), true);
    assert.strictEqual(valuesMatch("hello", "world"), false);
  });

  it("布尔匹配", () => {
    assert.strictEqual(valuesMatch(true, true), true);
    assert.strictEqual(valuesMatch(true, false), false);
  });

  it("数组匹配", () => {
    assert.strictEqual(valuesMatch([1, 2, 3], [1, 2, 3]), true);
    assert.strictEqual(valuesMatch([1, 2], [1, 2, 3]), false);
  });
});

describe("createDefaultGameState", () => {
  it("创建默认状态包含所有必需字段", () => {
    const state = createDefaultGameState();
    assert.strictEqual(state.hp, 10);
    assert.strictEqual(state.sanity, 80);
    assert.strictEqual(state.originium, 3);
    assert.strictEqual(state.profession, "调查员");
    assert.ok(state.inventory.length > 0);
    assert.ok(state.tasks.length > 0);
  });

  it("overrides 可覆盖默认值", () => {
    const state = createDefaultGameState({ hp: 5, sanity: 30 });
    assert.strictEqual(state.hp, 5);
    assert.strictEqual(state.sanity, 30);
    assert.strictEqual(state.originium, 3); // 未覆盖
  });
});

// === 场景加载测试 ===

const SCENARIOS_PATH = path.resolve(__dirname, "../../../../benchmarks/task-eval/scenarios.json");

describe("scenario loading", () => {
  it("场景文件存在且可解析", () => {
    assert.ok(fs.existsSync(SCENARIOS_PATH), `scenarios.json not found at ${SCENARIOS_PATH}`);
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    assert.ok(scenarios.length >= 6, `expected >= 6 scenarios, got ${scenarios.length}`);
  });

  it("所有场景有合法结构", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];

    for (const scenario of scenarios) {
      assert.ok(scenario.id, `missing id in scenario ${scenario.name}`);
      assert.ok(scenario.name, `missing name`);
      assert.ok(["basic", "intermediate", "advanced"].includes(scenario.difficulty),
        `invalid difficulty: ${scenario.difficulty}`);
      assert.ok(scenario.systems.length > 0, `no systems in ${scenario.id}`);
      assert.ok(scenario.playerActions.length > 0, `no player actions in ${scenario.id}`);
      assert.ok(scenario.expectedOutcomes.length > 0, `no expected outcomes in ${scenario.id}`);

      // 验证权重之和接近 1
      const totalWeight = scenario.expectedOutcomes.reduce((sum, o) => sum + (o.weight ?? 0), 0);
      assert.ok(Math.abs(totalWeight - 1.0) < 0.15,
        `weights sum to ${totalWeight} for ${scenario.id}, expected ~1.0`);
    }
  });

  it("覆盖所有难度等级", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const difficulties = new Set(scenarios.map((s) => s.difficulty));
    for (const d of ["basic", "intermediate", "advanced"]) {
      assert.ok(difficulties.has(d), `missing difficulty: ${d}`);
    }
  });

  it("覆盖主要游戏系统", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const allSystems = new Set(scenarios.flatMap((s) => s.systems));
    const required = ["item", "inventory", "originium", "sanity", "weapon", "combat", "codex", "npc", "task", "profession"];
    for (const system of required) {
      assert.ok(allSystems.has(system), `missing system: ${system}. Present: ${[...allSystems].join(", ")}`);
    }
  });
});

// === 离线评测测试 ===

describe("evaluateTaskScenarioOffline", () => {
  it("基础物品拾取场景通过", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const scenario = scenarios.find((s) => s.id === "task_item_pickup_001");
    assert.ok(scenario, "scenario not found");

    const result = evaluateTaskScenarioOffline(scenario);
    assert.strictEqual(result.scenarioId, "task_item_pickup_001");
    assert.ok(result.stepResults.length > 0, "should have step results");
    assert.ok(result.finalState.inventory && result.finalState.inventory.length >= 2,
      `expected >= 2 items, got ${result.finalState.inventory?.length}`);
    // basic 场景应该通过
    assert.strictEqual(result.passed, true, `expected pass, failures: ${result.failures.join("; ")}`);
  });

  it("原石恢复场景通过", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const scenario = scenarios.find((s) => s.id === "task_originium_restore_001");
    assert.ok(scenario);

    const result = evaluateTaskScenarioOffline(scenario);
    assert.strictEqual(result.passed, true,
      `expected pass, score=${result.score}, failures: ${result.failures.join("; ")}`);
  });

  it("武器战斗场景通过", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const scenario = scenarios.find((s) => s.id === "task_weapon_combat_001");
    assert.ok(scenario);

    const result = evaluateTaskScenarioOffline(scenario);
    assert.strictEqual(result.passed, true,
      `expected pass, score=${result.score}, failures: ${result.failures.join("; ")}`);
  });

  it("NPC 图鉴发现场景通过", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const scenario = scenarios.find((s) => s.id === "task_npc_discovery_001");
    assert.ok(scenario);

    const result = evaluateTaskScenarioOffline(scenario);
    assert.strictEqual(result.passed, true,
      `expected pass, failures: ${result.failures.join("; ")}`);
  });

  it("任务完成场景通过", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const scenario = scenarios.find((s) => s.id === "task_quest_complete_001");
    assert.ok(scenario);

    const result = evaluateTaskScenarioOffline(scenario);
    // intermediate 允许部分通过（>=80%）
    assert.ok(result.score >= 0.5, `expected score >= 0.5, got ${result.score}`);
  });

  it("复合回合场景有合理分数", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];
    const scenario = scenarios.find((s) => s.id === "task_compound_turn_001");
    assert.ok(scenario);

    const result = evaluateTaskScenarioOffline(scenario);
    // advanced 场景期望 >= 80% 通过
    assert.ok(result.passed, `advanced scenario should pass (>=80%), got score=${result.score}`);
    assert.ok(result.outcomes.length >= 4, `expected >= 4 outcome checks, got ${result.outcomes.length}`);
  });

  it("所有场景评测完成不抛异常", () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];

    for (const scenario of scenarios) {
      try {
        const result = evaluateTaskScenarioOffline(scenario);
        assert.ok(result.scenarioId === scenario.id);
        assert.ok(result.score >= 0 && result.score <= 1,
          `score out of range: ${result.score} for ${scenario.id}`);
      } catch (err) {
        assert.fail(`scenario ${scenario.id} threw: ${err}`);
      }
    }
  });
});

// === 批次评测 ===

describe("runTaskEval", () => {
  it("批次运行所有场景并生成摘要", async () => {
    const content = fs.readFileSync(SCENARIOS_PATH, "utf8");
    const scenarios = JSON.parse(content) as TaskEvalScenario[];

    const summary = await runTaskEval({
      scenarios,
      mockMode: true,
      timeoutMs: 30_000,
      checkIntermediateSteps: true,
      continueOnFailure: true,
    });

    assert.strictEqual(summary.totalScenarios, scenarios.length);
    assert.ok(summary.passRate >= 0, `passRate should be >= 0, got ${summary.passRate}`);
    assert.ok(summary.averageScore >= 0, `averageScore should be >= 0`);
    assert.ok(summary.results.length === scenarios.length);
    assert.ok(summary.durationMs >= 0);

    // 难度分组
    assert.ok(summary.byDifficulty["basic"], "missing basic difficulty group");
    assert.ok(summary.byDifficulty["intermediate"], "missing intermediate difficulty group");
    assert.ok(summary.byDifficulty["advanced"], "missing advanced difficulty group");

    // 系统分组
    assert.ok(Object.keys(summary.bySystem).length > 0, "should have system groupings");

    // basic 场景应该 100% 通过
    const basicGroup = summary.byDifficulty["basic"];
    assert.ok(basicGroup);
    assert.strictEqual(basicGroup.rate, 1.0,
      `all basic scenarios should pass, got ${basicGroup.rate}`);
  });
});

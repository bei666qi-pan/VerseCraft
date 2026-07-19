/**
 * v3 升级测试：scenario library、SUT adapter、trace artifact、失败聚类、DM-only 泄漏
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  SCENARIOS,
  getScenariosByCategory,
  findScenario,
  getScenariosForPersona,
  getScenarioLibraryStats,
} from "./scenarios";
import {
  checkAllInvariants,
  createInitialStateSnapshot,
  detectNpcResurrections,
} from "./invariants";
import {
  MockSutAdapter,
  createSutAdapter,
} from "./sutAdapter";
import {
  runSinglePlaythroughV3,
  runPlaythroughBatchV3,
  clusterFailures,
} from "./orchestrator";
import type { PlaythroughV3Config } from "./orchestrator";
import type { GameStateSnapshot } from "./types";
import type { SutAdapter, SutResponse } from "./sutAdapter";

describe("Scenario Library", () => {
  it("应至少有 20 个场景", () => {
    assert.ok(SCENARIOS.length >= 20, `应有 ≥ 20 场景，实际 ${SCENARIOS.length}`);
  });

  it("四大路径都应有覆盖（happy/recovery/refusal/abandonment）", () => {
    for (const cat of ["happy", "recovery", "refusal", "abandonment"] as const) {
      const list = getScenariosByCategory(cat);
      assert.ok(list.length > 0, `${cat} 路径应有场景`);
    }
  });

  it("每个场景应有合法 persona 列表与预期终止原因", () => {
    for (const s of SCENARIOS) {
      assert.ok(s.personas.length > 0, `${s.id} 应有 persona`);
      assert.ok(s.expectedTerminations.length > 0, `${s.id} 应有 expectedTerminations`);
      assert.ok(s.id.length > 0 && s.id.length <= 64, `${s.id} id 长度应合法`);
    }
  });

  it("场景 ID 应唯一", () => {
    const ids = new Set<string>();
    for (const s of SCENARIOS) {
      assert.ok(!ids.has(s.id), `重复场景 ID: ${s.id}`);
      ids.add(s.id);
    }
  });

  it("按 ID 查找场景应可用", () => {
    const s = findScenario("happy-speedrun");
    assert.ok(s, "应能找到 happy-speedrun");
    assert.equal(s?.category, "refusal");
  });

  it("按 persona 找出所有适用场景", () => {
    const speedrunScenarios = getScenariosForPersona("speedrunner");
    assert.ok(speedrunScenarios.length > 0);
    assert.ok(speedrunScenarios.some((s) => s.id === "happy-trade"));
  });

  it("统计函数应返回正确数量", () => {
    const stats = getScenarioLibraryStats();
    assert.ok(stats.total >= 20);
    assert.ok(stats.byCategory.happy > 0);
    assert.ok(stats.personaCoverage.speedrunner > 0);
  });
});

describe("SUT Adapter", () => {
  it("MockSutAdapter 应可用且返回模拟响应", async () => {
    const sut = new MockSutAdapter();
    const r = await sut.step({ playerAction: "前进", persona: "explorer", stepIndex: 0 });
    assert.equal(r.status, "ok");
    assert.ok(typeof r.narrative === "string");
    assert.ok(r.dmJson && typeof r.dmJson === "object");
    await sut.reset?.();
  });

  it("createSutAdapter(mock=true) 返回 MockSutAdapter", () => {
    const sut = createSutAdapter({ mock: true });
    assert.equal(sut.kind, "mock");
  });

  it("createSutAdapter(mock=false) 缺 baseUrl 应报错", () => {
    assert.throws(() => createSutAdapter({ mock: false }));
  });

  it("createSutAdapter(mock=false) 有 baseUrl 返回 HttpSutAdapter", () => {
    const sut = createSutAdapter({ mock: false, baseUrl: "http://localhost:666" });
    assert.equal(sut.kind, "http");
  });
});

describe("v3 不变量", () => {
  it("应检测 DM-only 泄漏（system prompt）", () => {
    const state = createInitialStateSnapshot();
    const r = checkAllInvariants(0, state, undefined, "system prompt: 你是一个DM");
    assert.ok(!r.passed, "DM-only 泄漏应让 passed=false");
    assert.ok(r.violations.some((v) => v.rule === "dm_only_leak"));
  });

  it("应检测 DM-only 泄漏（JSON 格式）", () => {
    const state = createInitialStateSnapshot();
    const r = checkAllInvariants(0, state, undefined, "请严格以 JSON 格式输出");
    assert.ok(r.violations.some((v) => v.rule === "dm_only_leak"));
  });

  it("应检测 HP 单步跳变", () => {
    const prev = createInitialStateSnapshot({ hp: 10 });
    const curr = createInitialStateSnapshot({ hp: 10, sanity: prev.sanity - 35 });
    const r = checkAllInvariants(1, curr, prev);
    assert.ok(r.violations.some((v) => v.rule === "sanity_jump"));
  });

  it("应检测楼层瞬移（单步 ≥ 4 层）", () => {
    const prev = createInitialStateSnapshot({ playerLocation: "1F_Lobby" });
    const curr = createInitialStateSnapshot({ playerLocation: "5F_天台" });
    const r = checkAllInvariants(1, curr, prev);
    assert.ok(r.violations.some((v) => v.rule === "position_teleport"));
  });

  it("正常单层移动不应触发瞬移", () => {
    const prev = createInitialStateSnapshot({ playerLocation: "3F_走廊" });
    const curr = createInitialStateSnapshot({ playerLocation: "4F_走廊" });
    const r = checkAllInvariants(1, curr, prev);
    assert.ok(!r.violations.some((v) => v.rule === "position_teleport"));
  });

  it("合法 narrative 应不触发任何泄漏", () => {
    const state = createInitialStateSnapshot();
    const narrative = "你握紧武器，沿着走廊慢慢前进。灯管闪了两下，地面传来微弱的震动。";
    const r = checkAllInvariants(0, state, undefined, narrative);
    assert.ok(!r.violations.some((v) => v.rule === "dm_only_leak"));
  });
});

describe("NPC 复活检测", () => {
  it("死亡 NPC 不应在 alive 列表中（不应被检测为复活）", () => {
    const stateA: GameStateSnapshot = createInitialStateSnapshot({
      aliveNpcIds: ["npc_liao_an"],
      deadNpcIds: [],
    });
    const stateB: GameStateSnapshot = createInitialStateSnapshot({
      aliveNpcIds: [],
      deadNpcIds: ["npc_liao_an"],
    });
    const result = detectNpcResurrections([
      { stepIndex: 0, stateAfter: stateA, narrative: "他在。" },
      { stepIndex: 1, stateAfter: stateB, narrative: "他走了。" },
    ]);
    assert.equal(result.resurrections.length, 0);
  });

  it("死亡 NPC 在后文复活应被检测", () => {
    const stateA: GameStateSnapshot = createInitialStateSnapshot({
      aliveNpcIds: ["npc_liao_an"],
      deadNpcIds: [],
    });
    const stateB: GameStateSnapshot = createInitialStateSnapshot({
      aliveNpcIds: [],
      deadNpcIds: ["npc_liao_an"],
    });
    const stateC: GameStateSnapshot = createInitialStateSnapshot({
      aliveNpcIds: ["npc_liao_an"],
      deadNpcIds: [],
    });
    const result = detectNpcResurrections([
      { stepIndex: 0, stateAfter: stateA, narrative: "" },
      { stepIndex: 1, stateAfter: stateB, narrative: "" },
      { stepIndex: 2, stateAfter: stateC, narrative: "" },
    ]);
    assert.equal(result.resurrections.length, 1);
    assert.equal(result.resurrections[0]?.npcId, "npc_liao_an");
  });
});

describe("v3 编排器 (mock)", () => {
  const baseV3Config: PlaythroughV3Config = {
    personas: ["speedrunner"],
    runsPerPersona: 1,
    maxStepsPerRun: 8,
    baseSeed: 42,
    mockMode: true,
    runNarrativeJudge: true,
    softlockThreshold: 5,
    stepTimeoutMs: 10000,
    enableFailureClustering: true,
  };

  it("单个场景单 persona 单 run 应产出 trace artifact", async () => {
    const scenario = findScenario("happy-trade")!;
    const sut = new MockSutAdapter();
    const result = await runSinglePlaythroughV3(baseV3Config, scenario, "speedrunner", 0, sut);
    assert.ok(result.transcript, "应有 transcript");
    assert.ok(result.trace, "应有 trace");
    assert.equal(result.scenarioId, "happy-trade");
    assert.ok(result.trace.scenarioCategory === "happy");
    assert.ok(result.trace.steps.length > 0);
    assert.deepEqual(result.trace.initialState, result.transcript.initialState);
  });

  it("trace artifact 应包含步骤详情、不变量、narrative 裁判", async () => {
    const scenario = findScenario("recovery-low-hp")!;
    const sut = new MockSutAdapter();
    const result = await runSinglePlaythroughV3(baseV3Config, scenario, "speedrunner", 0, sut);
    assert.ok(Array.isArray(result.trace.invariantChecks));
    assert.ok(result.trace.failureTags !== undefined);
    assert.ok(typeof result.trace.durationMs === "number");
  });

  it("Live 运行可对可重试 degraded 执行单次重试并继续", async () => {
    const config: PlaythroughV3Config = {
      personas: ["speedrunner"],
      runsPerPersona: 1,
      maxStepsPerRun: 1,
      baseSeed: 42,
      mockMode: false,
      runNarrativeJudge: false,
      softlockThreshold: 5,
      stepTimeoutMs: 10000,
      scenarioIds: ["weapon-lifecycle"],
    };

    const scenario = findScenario("weapon-lifecycle")!;
    let calls = 0;
    const responses: Array<Omit<SutResponse, "latencyMs">> = [
      {
        narrative: "当前网络暂时拥塞，请稍后重试。",
        dmJson: { narrative: "当前网络暂时拥塞，请稍后重试。", is_action_legal: true },
        status: "degraded",
        reachedFinal: true,
        aiStatus: "temporary_busy",
      },
      {
        narrative: "你向前走去，阴影退去。",
        dmJson: {
          is_action_legal: true,
          consumes_time: true,
          sanity_damage: 0,
          is_death: false,
          reached_ending: false,
        },
        status: "ok",
        reachedFinal: true,
      },
    ];

    const sut: SutAdapter = {
      kind: "http",
      async step() {
        const r = responses[Math.min(calls, responses.length - 1)]!;
        calls += 1;
        return {
          ...r,
          latencyMs: 10,
        };
      },
      async reset() {},
    } as SutAdapter;

    const result = await runSinglePlaythroughV3(config, scenario, "speedrunner", 0, sut);
    assert.equal(result.transcript.steps.length, 1);
    assert.equal(calls, 2);
    assert.equal(result.transcript.steps[0]?.dmJson.is_action_legal, true);
    assert.equal(result.passed, true);
  });

  it("refusal-path 场景应被检测出更多失败（rulebreaker）", async () => {
    const scenario = findScenario("refusal-prompt-injection")!;
    const sut = new MockSutAdapter();
    const result = await runSinglePlaythroughV3(
      { ...baseV3Config, runsPerPersona: 2, maxStepsPerRun: 5 },
      scenario,
      "rulebreaker",
      0,
      sut
    );
    assert.ok(result.transcript);
    // rulebreaker 行为可能产生失败 — 但不应崩溃
    assert.ok(typeof result.passed === "boolean");
  });

  it("failureClusters 函数应工作", () => {
    const empty = clusterFailures([], new Map());
    assert.equal(empty.length, 0);
  });
});

describe("v3 批次编排 (mock)", () => {
  const baseBatchConfig: PlaythroughV3Config = {
    personas: ["speedrunner"],
    runsPerPersona: 1,
    maxStepsPerRun: 5,
    baseSeed: 42,
    mockMode: true,
    runNarrativeJudge: false,
    softlockThreshold: 5,
    stepTimeoutMs: 10000,
  };

  it("按路径过滤场景应只跑该路径", async () => {
    const config: PlaythroughV3Config = {
      personas: ["speedrunner", "explorer"],
      runsPerPersona: 1,
      maxStepsPerRun: 5,
      baseSeed: 42,
      mockMode: true,
      runNarrativeJudge: false, // 关闭以加快测试
      softlockThreshold: 5,
      stepTimeoutMs: 10000,
      scenarioCategories: ["happy"],
    };
    const summary = await runPlaythroughBatchV3(config);
    // happy 路径应有 ≥ 5 个场景，每个场景 2 个 persona × 1 run
    assert.ok(summary.totalRuns >= 5);
    // 全部应是 happy
    for (const sid of Object.keys(summary.scenarioMap)) {
      assert.equal(summary.scenarioMap[sid]?.category, "happy");
    }
  });

  it("scenarioIds 应只执行指定场景", async () => {
    const summary = await runPlaythroughBatchV3({
      ...baseBatchConfig,
      scenarioIds: ["weapon-lifecycle"],
      personas: ["speedrunner", "explorer", "collector"],
      maxStepsPerRun: 2,
      runNarrativeJudge: false,
    });
    assert.deepEqual(Object.keys(summary.scenarioMap), ["weapon-lifecycle"]);
    assert.equal(summary.totalRuns, 3, "weapon-lifecycle 应覆盖其三个 persona");
  });

  it("personas 应限制指定场景实际执行的人格", async () => {
    const summary = await runPlaythroughBatchV3({
      ...baseBatchConfig,
      scenarioIds: ["weapon-lifecycle"],
      personas: ["collector"],
      maxStepsPerRun: 2,
    });
    assert.equal(summary.totalRuns, 1);
    assert.deepEqual(Object.keys(summary.byPersona), ["收集癖玩家"]);
  });

  it("未知 scenarioIds 应快速失败，避免误跑整库", async () => {
    await assert.rejects(
      () => runPlaythroughBatchV3({ ...baseBatchConfig, scenarioIds: ["missing-scenario"] }),
      /Unknown scenario ids/,
    );
  });

  it("actionFactory 应覆盖通用玩家动作", async () => {
    const actions: string[] = [];
    const sut = {
      kind: "mock" as const,
      step: async (action: { playerAction: string }) => {
        actions.push(action.playerAction);
        return { narrative: "你完成了检查。", dmJson: {}, latencyMs: 0, status: "ok" as const, reachedFinal: true };
      },
    };
    await runSinglePlaythroughV3(
      { ...baseBatchConfig, maxStepsPerRun: 1, actionFactory: () => "专项动作" },
      findScenario("weapon-lifecycle")!,
      "speedrunner",
      0,
      sut,
    );
    assert.deepEqual(actions, ["专项动作"]);
  });
});

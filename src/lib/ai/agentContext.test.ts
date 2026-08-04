/**
 * AgentContext 单元测试 — 验证 dev/test 模式切换 + 测试范围推断
 * + Worker 状态机 + 风险分级路由
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createAgentContext,
  inferTestScope,
  createPassReport,
  createFailReport,
  canProceed,
  getFailures,
  agentEnvFromContext,
  // Worker 状态机
  isValidTransition,
  nextStates,
  getTransition,
  getPosture,
  isLoopExhausted,
  STATE_TRANSITIONS,
  MAX_FIX_LOOP,
  // 风险分级
  inferRiskLevel,
  getTestBudget,
  getRequiredTestModes,
} from "./agentContext";
import type { WorkerState } from "./agentContext";

// ═══════════════════════════════════════════════════════════
// Worker 状态机
// ═══════════════════════════════════════════════════════════

describe("Worker 状态机", () => {
  describe("STATE_TRANSITIONS", () => {
    it("包含主推进路径", () => {
      const states: WorkerState[] = [
        "UNDERSTAND", "BASELINE", "REPRODUCE", "IMPLEMENT",
        "FOCUSED_TEST", "ADVERSARIAL_TEST", "APP_TEST", "REGRESSION", "HANDOFF",
      ];
      for (let i = 0; i < states.length - 1; i++) {
        assert.ok(
          isValidTransition(states[i], states[i + 1]),
          `应从 ${states[i]} 推进到 ${states[i + 1]}`,
        );
      }
    });

    it("包含失败回环路径", () => {
      const testStates: WorkerState[] = [
        "FOCUSED_TEST", "ADVERSARIAL_TEST", "APP_TEST", "REGRESSION",
      ];
      for (const state of testStates) {
        assert.ok(
          isValidTransition(state, "IMPLEMENT"),
          `${state} 失败应回到 IMPLEMENT`,
        );
      }
    });

    it("包含 BLOCKED 路径", () => {
      assert.ok(isValidTransition("UNDERSTAND", "BLOCKED"));
      assert.ok(isValidTransition("FOCUSED_TEST", "BLOCKED"));
      assert.ok(isValidTransition("BLOCKED", "REPRODUCE"));
    });

    it("非法转换返回 false", () => {
      assert.equal(isValidTransition("HANDOFF", "IMPLEMENT"), false);
      assert.equal(isValidTransition("UNDERSTAND", "FOCUSED_TEST"), false);
      assert.equal(isValidTransition("BASELINE", "REGRESSION"), false);
    });

    it("每个状态至少有一个出口（除 HANDOFF）", () => {
      const nonTerminal: WorkerState[] = [
        "UNDERSTAND", "BASELINE", "REPRODUCE", "IMPLEMENT",
        "FOCUSED_TEST", "ADVERSARIAL_TEST", "APP_TEST", "REGRESSION", "BLOCKED",
      ];
      for (const state of nonTerminal) {
        const exits = nextStates(state);
        assert.ok(
          exits.length >= 1,
          `${state} 应有至少一个出口，当前: ${exits.length}`,
        );
      }
    });

    it("HANDOFF 是终态（无出口）", () => {
      assert.deepEqual(nextStates("HANDOFF"), []);
    });

    it("UNDERSTAND 出口包含 BASELINE 和 BLOCKED", () => {
      const exits = nextStates("UNDERSTAND");
      assert.ok(exits.includes("BASELINE"));
      assert.ok(exits.includes("BLOCKED"));
    });
  });

  describe("getTransition", () => {
    it("返回存在的转换", () => {
      const t = getTransition("FOCUSED_TEST", "ADVERSARIAL_TEST");
      assert.ok(t);
      assert.equal(t.from, "FOCUSED_TEST");
      assert.equal(t.to, "ADVERSARIAL_TEST");
      assert.equal(t.autoAdvance, true);
    });

    it("不存在返回 undefined", () => {
      assert.equal(getTransition("HANDOFF", "IMPLEMENT"), undefined);
    });
  });

  describe("STATE_TRANSITIONS 完整性", () => {
    it("所有转换条件非空", () => {
      for (const t of STATE_TRANSITIONS) {
        assert.ok(
          t.condition.length > 0,
          `${t.from} → ${t.to} 的条件不能为空`,
        );
      }
    });

    it("所有转换 from/to 是合法 WorkerState", () => {
      const validStates = new Set<WorkerState>([
        "UNDERSTAND", "BASELINE", "REPRODUCE", "IMPLEMENT",
        "FOCUSED_TEST", "ADVERSARIAL_TEST", "APP_TEST", "REGRESSION",
        "HANDOFF", "BLOCKED",
      ]);
      for (const t of STATE_TRANSITIONS) {
        assert.ok(validStates.has(t.from), `非法 from: ${t.from}`);
        assert.ok(validStates.has(t.to), `非法 to: ${t.to}`);
      }
    });
  });

  describe("getPosture", () => {
    it("dev 状态返回 dev", () => {
      for (const state of ["UNDERSTAND", "BASELINE", "REPRODUCE", "IMPLEMENT"] as WorkerState[]) {
        assert.equal(getPosture(state), "dev", `${state} 应为 dev 姿态`);
      }
    });

    it("test 状态返回 test", () => {
      for (const state of [
        "FOCUSED_TEST", "ADVERSARIAL_TEST", "APP_TEST",
        "REGRESSION", "HANDOFF", "BLOCKED",
      ] as WorkerState[]) {
        assert.equal(getPosture(state), "test", `${state} 应为 test 姿态`);
      }
    });
  });

  describe("isLoopExhausted", () => {
    it("循环次数 < MAX 时未耗尽", () => {
      assert.equal(isLoopExhausted(0), false);
      assert.equal(isLoopExhausted(2), false);
      assert.equal(isLoopExhausted(4), false);
    });

    it("循环次数 >= MAX 时耗尽", () => {
      assert.equal(isLoopExhausted(5), true);
      assert.equal(isLoopExhausted(6), true);
      assert.equal(isLoopExhausted(MAX_FIX_LOOP), true);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// 风险分级
// ═══════════════════════════════════════════════════════════

describe("inferRiskLevel", () => {
  it("文档改动 → L0", () => {
    assert.equal(inferRiskLevel(["docs/README.md"]), "L0");
    assert.equal(inferRiskLevel(["AGENTS.md"]), "L0");
  });

  it("纯函数改动 → L1", () => {
    assert.equal(inferRiskLevel(["src/lib/someUtil.ts"]), "L1");
  });

  it("Store 改动 → L2", () => {
    assert.equal(inferRiskLevel(["src/store/useGameStore.ts"]), "L2");
  });

  it("组件改动 → L2", () => {
    assert.equal(inferRiskLevel(["src/components/HomeClient.tsx"]), "L2");
  });

  it("E2E 改动 → L2", () => {
    assert.equal(inferRiskLevel(["e2e/play.spec.ts"]), "L2");
  });

  it("/api/chat 改动 → L3", () => {
    assert.equal(inferRiskLevel(["src/app/api/chat/route.ts"]), "L3");
  });

  it("turnEngine 改动 → L3", () => {
    assert.equal(inferRiskLevel(["src/lib/turnEngine/normalizePlayerInput.ts"]), "L3");
  });

  it("playRealtime 改动 → L3", () => {
    assert.equal(inferRiskLevel(["src/lib/playRealtime/playerChatSystemPrompt.ts"]), "L3");
  });

  it("DB schema 改动 → L3", () => {
    assert.equal(inferRiskLevel(["src/db/schema.ts"]), "L3");
  });

  it("AI 模块改动 → L3", () => {
    assert.equal(inferRiskLevel(["src/lib/ai/router/execute.ts"]), "L3");
  });

  it("security 改动 → L4", () => {
    assert.equal(inferRiskLevel(["src/lib/security/chatRiskLane.ts"]), "L4");
  });

  it("epistemic 改动 → L4", () => {
    assert.equal(inferRiskLevel(["src/lib/epistemic/detector.ts"]), "L4");
  });

  it("npcConsistency 改动 → L4", () => {
    assert.equal(inferRiskLevel(["src/lib/npcConsistency/validator.ts"]), "L4");
  });

  it("worldEngine 改动 → L4", () => {
    assert.equal(inferRiskLevel(["src/lib/worldEngine/queue.ts"]), "L4");
  });

  it("narrativeGovernance 改动 → L4", () => {
    assert.equal(inferRiskLevel(["src/lib/narrativeGovernance/foreshadowLedger.ts"]), "L4");
  });

  it("多文件取最高风险", () => {
    assert.equal(
      inferRiskLevel(["docs/readme.md", "src/app/api/chat/route.ts"]),
      "L3",
    );
    assert.equal(
      inferRiskLevel(["src/store/a.ts", "src/lib/security/b.ts"]),
      "L4",
    );
  });

  it("空列表返回 L1 兜底", () => {
    assert.equal(inferRiskLevel([]), "L1");
  });
});

describe("getTestBudget", () => {
  it("L0 预算全为 0", () => {
    const b = getTestBudget("L0");
    assert.equal(b.focusedMs, 0);
    assert.equal(b.adversarialMs, 0);
    assert.equal(b.appTestMs, 0);
    assert.equal(b.regressionMs, 0);
  });

  it("L1 有 focused + adversarial + regression", () => {
    const b = getTestBudget("L1");
    assert.ok(b.focusedMs > 0);
    assert.ok(b.adversarialMs > 0);
    assert.equal(b.appTestMs, 0);
    assert.ok(b.regressionMs > 0);
  });

  it("L2 包含 appTest", () => {
    const b = getTestBudget("L2");
    assert.ok(b.appTestMs > 0);
  });

  it("L3 预算比 L2 大", () => {
    const b2 = getTestBudget("L2");
    const b3 = getTestBudget("L3");
    assert.ok(b3.focusedMs >= b2.focusedMs);
    assert.ok(b3.adversarialMs >= b2.adversarialMs);
  });

  it("L4 预算最大", () => {
    const b3 = getTestBudget("L3");
    const b4 = getTestBudget("L4");
    assert.ok(b4.focusedMs >= b3.focusedMs);
    assert.ok(b4.adversarialMs >= b3.adversarialMs);
  });
});

describe("getRequiredTestModes", () => {
  it("L0 无必需测试", () => {
    assert.deepEqual(getRequiredTestModes("L0"), []);
  });

  it("L1 只需 focused", () => {
    assert.deepEqual(getRequiredTestModes("L1"), ["focused"]);
  });

  it("L2 需 focused + adversarial + app", () => {
    const modes = getRequiredTestModes("L2");
    assert.ok(modes.includes("focused"));
    assert.ok(modes.includes("adversarial"));
    assert.ok(modes.includes("app"));
  });

  it("L3 需 focused + adversarial + app + regression", () => {
    const modes = getRequiredTestModes("L3");
    assert.ok(modes.includes("focused"));
    assert.ok(modes.includes("adversarial"));
    assert.ok(modes.includes("app"));
    assert.ok(modes.includes("regression"));
  });

  it("L4 需全部包括 live_eval", () => {
    const modes = getRequiredTestModes("L4");
    assert.ok(modes.includes("focused"));
    assert.ok(modes.includes("adversarial"));
    assert.ok(modes.includes("app"));
    assert.ok(modes.includes("regression"));
    assert.ok(modes.includes("live_eval"));
  });
});

// ═══════════════════════════════════════════════════════════
// AgentContext 构建（更新后）
// ═══════════════════════════════════════════════════════════

describe("createAgentContext (updated)", () => {
  it("默认状态为 UNDERSTAND", () => {
    const ctx = createAgentContext("dev");
    assert.equal(ctx.workerState, "UNDERSTAND");
  });

  it("默认修复循环计数为 0", () => {
    const ctx = createAgentContext("test");
    assert.equal(ctx.fixLoopCount, 0);
  });

  it("从 lastDiff 推断风险级别", () => {
    const ctx = createAgentContext("dev", {
      lastDiff: {
        files: ["src/app/api/chat/route.ts"],
        summary: "chat route 改动",
      },
    });
    assert.equal(ctx.riskLevel, "L3");
  });

  it("支持覆盖 workerState", () => {
    const ctx = createAgentContext("dev", {
      workerState: "IMPLEMENT",
      fixLoopCount: 2,
    });
    assert.equal(ctx.workerState, "IMPLEMENT");
    assert.equal(ctx.fixLoopCount, 2);
  });

  it("dev 模式 context 包含所有必需字段", () => {
    const ctx = createAgentContext("dev");
    // 检查所有必需字段存在
    assert.ok(typeof ctx.mode === "string");
    assert.ok(typeof ctx.workerState === "string");
    assert.ok(typeof ctx.provenance === "object");
    assert.ok(typeof ctx.riskLevel === "string");
    assert.ok(typeof ctx.fixLoopCount === "number");
    assert.ok(Array.isArray(ctx.affectedModules));
    assert.ok(typeof ctx.testScope === "object");
  });
});

describe("createAgentContext (legacy API)", () => {
  it("创建 dev 模式上下文", () => {
    const ctx = createAgentContext("dev");
    assert.equal(ctx.mode, "dev");
    assert.match(ctx.provenance.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual(ctx.affectedModules, []);
    assert.deepEqual(ctx.testScope.unit, []);
  });

  it("创建 test 模式上下文", () => {
    const ctx = createAgentContext("test");
    assert.equal(ctx.mode, "test");
  });

  it("支持 overrides", () => {
    const ctx = createAgentContext("test", {
      affectedModules: ["src/lib/turnEngine/normalizePlayerInput.ts"],
      testScope: {
        unit: ["src/lib/turnEngine/normalizePlayerInput.test.ts"],
        contract: [],
        e2e: [],
        eval: [],
        benchmark: [],
      },
    });
    assert.equal(ctx.affectedModules.length, 1);
    assert.equal(ctx.testScope.unit.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════
// inferTestScope（更新后含 riskLevel）
// ═══════════════════════════════════════════════════════════

describe("inferTestScope", () => {
  it("包含 riskLevel", () => {
    const scope = inferTestScope(["src/lib/turnEngine/normalizePlayerInput.ts"]);
    assert.equal(scope.riskLevel, "L3");
  });

  it("Turn Engine 修改触发 unit + contract", () => {
    const scope = inferTestScope(["src/lib/turnEngine/normalizePlayerInput.ts"]);
    assert.ok(scope.unit.some((u) => u.includes("turnEngine")));
    assert.ok(scope.contract.some((c) => c.includes("chatRouteContract")));
  });

  it("/api/chat 修改触发 contract + e2e + benchmark", () => {
    const scope = inferTestScope(["src/app/api/chat/route.ts"]);
    assert.ok(scope.contract.length >= 2);
    assert.ok(scope.e2e.includes("chat-sse-contract.spec.ts"));
    assert.ok(scope.benchmark.includes("chat-metrics"));
  });

  it("eval 修改触发 unit tests", () => {
    const scope = inferTestScope(["src/lib/evals/judge/calibration.ts"]);
    assert.ok(scope.unit.some((u) => u.includes("evals")));
  });

  it("Store 修改触发 unit + play e2e + idb e2e", () => {
    const scope = inferTestScope(["src/store/useGameStore.ts"]);
    assert.ok(scope.e2e.includes("play.spec.ts"));
    assert.ok(scope.e2e.includes("idb-hydration.spec.ts"));
  });

  it("Chapters 修改触发 unit + chapter e2e", () => {
    const scope = inferTestScope(["src/lib/chapters/engine.ts"]);
    assert.ok(scope.unit.some((u) => u.includes("chapters")));
    assert.ok(scope.e2e.includes("chapter-flow.spec.ts"));
  });

  it("Epistemic 修改触发 unit + narrative-safety eval", () => {
    const scope = inferTestScope(["src/lib/epistemic/detector.ts"]);
    assert.ok(scope.unit.some((u) => u.includes("epistemic")));
    assert.ok(scope.eval.includes("narrative-safety"));
  });

  it("Combat 修改触发 unit", () => {
    const scope = inferTestScope(["src/lib/combat/combatAdjudication.ts"]);
    assert.ok(scope.unit.some((u) => u.includes("combat")));
  });

  it("自动推断同名 test 文件", () => {
    const scope = inferTestScope(["src/lib/ai/someModule.ts"]);
    assert.ok(scope.unit.includes("src/lib/ai/someModule.test.ts"));
  });

  it("不推断 .test.ts 文件自身的同名文件", () => {
    const scope = inferTestScope(["src/lib/ai/someModule.test.ts"]);
    // 应通过 AI module 规则加入 unit glob，不额外加同名 test
    const exactMatch = scope.unit.filter(
      (u) => u === "src/lib/ai/someModule.test.ts.test.ts",
    );
    assert.equal(exactMatch.length, 0);
  });

  it("空文件列表返回空 scope + L1 risk", () => {
    const scope = inferTestScope([]);
    assert.equal(scope.riskLevel, "L1");
    assert.equal(scope.unit.length, 0);
    assert.equal(scope.contract.length, 0);
  });

  it("去重：重复触发同一测试", () => {
    const scope = inferTestScope([
      "src/lib/turnEngine/a.ts",
      "src/lib/turnEngine/b.ts",
    ]);
    const turnEngineUnits = scope.unit.filter((u) => u.includes("turnEngine"));
    assert.equal(turnEngineUnits.length, 3); // glob + 2 个具体文件
  });
});

// ═══════════════════════════════════════════════════════════
// 报告生成
// ═══════════════════════════════════════════════════════════

describe("报告生成", () => {
  it("createPassReport 生成通过报告", () => {
    const ctx = createAgentContext("test");
    const report = createPassReport(
      ctx.provenance,
      ["src/lib/ai/agentContext.ts"],
      "添加 agentContext.ts 模块",
    );
    assert.equal(report.verdict, "pass");
    assert.deepEqual(report.tests.lint, { errors: 0, warnings: 0 });
    assert.deepEqual(report.tests.build, { success: true });
  });

  it("createPassReport 包含 provenance", () => {
    const ctx = createAgentContext("test");
    const report = createPassReport(ctx.provenance, [], "test");
    assert.ok(report.provenance.commit.length === 40);
  });

  it("createFailReport 生成失败报告", () => {
    const ctx = createAgentContext("test");
    const report = createFailReport(
      ctx.provenance,
      ["src/lib/ai/agentContext.ts"],
      "添加 agentContext.ts 模块",
      ["eslint: 2 errors", "unit: playerInput fails"],
    );
    assert.equal(report.verdict, "fail");
    assert.equal(report.failures!.length, 2);
  });
});

describe("canProceed / getFailures", () => {
  it("无上次报告时 canProceed = true", () => {
    const ctx = createAgentContext("dev");
    assert.equal(canProceed(ctx), true);
  });

  it("通过报告后 canProceed = true", () => {
    const ctx = createAgentContext("test");
    ctx.lastTestReport = createPassReport(
      ctx.provenance,
      [],
      "test",
    );
    assert.equal(canProceed(ctx), true);
  });

  it("失败报告后 canProceed = false", () => {
    const ctx = createAgentContext("test");
    ctx.lastTestReport = createFailReport(
      ctx.provenance,
      [],
      "test",
      ["failure"],
    );
    assert.equal(canProceed(ctx), false);
    assert.equal(getFailures(ctx).length, 1);
  });
});

describe("agentEnvFromContext", () => {
  it("生成环境变量映射", () => {
    const ctx = createAgentContext("test", {
      provenance: {
        commit: "abc123",
        promptVersion: "v2",
        model: "deepseek-v3",
        config: "mock",
        datasetVersion: "v2.1.0",
        seed: 42,
        judgeProvenance: "deepseek-v3@v1",
        timestamp: "2026-01-01T00:00:00Z",
      },
    });
    const env = agentEnvFromContext(ctx);
    assert.equal(env.VERSECRAFT_DM_STABLE_PROMPT_VERSION, "v2");
    assert.equal(env.VERSECRAFT_EVAL_CONFIG, "mock");
    assert.equal(env.VERSECRAFT_EVAL_SEED, "42");
  });
});

// ═══════════════════════════════════════════════════════════
// 综合场景
// ═══════════════════════════════════════════════════════════

describe("综合：状态机 + 风险 + 预算", () => {
  it("典型 L3 改动流程", () => {
    // 模拟：chat route 改动
    const files = ["src/app/api/chat/route.ts"];
    const risk = inferRiskLevel(files);
    assert.equal(risk, "L3");

    const budget = getTestBudget(risk);
    assert.ok(budget.focusedMs > 0);
    assert.ok(budget.adversarialMs > 0);
    assert.ok(budget.appTestMs > 0);
    assert.ok(budget.regressionMs > 0);

    const modes = getRequiredTestModes(risk);
    assert.ok(modes.includes("focused"));
    assert.ok(modes.includes("regression"));

    // 验证测试范围
    const scope = inferTestScope(files);
    assert.equal(scope.riskLevel, "L3");
    assert.ok(scope.contract.length >= 2);
    assert.ok(scope.e2e.includes("chat-sse-contract.spec.ts"));
  });

  it("典型 L0 文档改动流程", () => {
    const risk = inferRiskLevel(["docs/README.md"]);
    assert.equal(risk, "L0");
    assert.deepEqual(getRequiredTestModes(risk), []);
    const budget = getTestBudget(risk);
    assert.equal(budget.focusedMs + budget.adversarialMs + budget.appTestMs + budget.regressionMs, 0);
  });

  it("修复循环正常不耗尽", () => {
    const ctx = createAgentContext("dev");
    ctx.fixLoopCount = 2;
    assert.equal(isLoopExhausted(ctx.fixLoopCount), false);
  });

  it("修复循环耗尽", () => {
    const ctx = createAgentContext("dev");
    ctx.fixLoopCount = MAX_FIX_LOOP;
    assert.equal(isLoopExhausted(ctx.fixLoopCount), true);
  });
});

// ═══════════════════════════════════════════════════════════
// IMPL-04: 状态追踪
// ═══════════════════════════════════════════════════════════

import {
  createStateLog,
  recordTransition,
  validateWorkerLoop,
  formatStateLog,
  validateReportProvenance,
  checkReportIntegrity,
} from "./agentContext";

describe("状态追踪 (IMPL-04)", () => {
  describe("createStateLog", () => {
    it("创建空日志", () => {
      const log = createStateLog();
      assert.equal(log.entries.length, 0);
      assert.equal(log.fixLoopCount, 0);
      assert.ok(log.startedAt.length > 0);
    });
  });

  describe("recordTransition", () => {
    it("记录一次转换", () => {
      const log = createStateLog();
      const updated = recordTransition(
        log,
        "UNDERSTAND",
        "BASELINE",
        "模块理解完成",
      );
      assert.equal(updated.entries.length, 1);
      assert.equal(updated.entries[0].from, "UNDERSTAND");
      assert.equal(updated.entries[0].to, "BASELINE");
      assert.equal(updated.entries[0].reason, "模块理解完成");
    });

    it("记录带退出码的转换", () => {
      const log = createStateLog();
      const updated = recordTransition(
        log,
        "IMPLEMENT",
        "FOCUSED_TEST",
        "运行 focused test",
        { exitCode: 0, assertionCount: 12 },
      );
      assert.equal(updated.entries[0].exitCode, 0);
      assert.equal(updated.entries[0].assertionCount, 12);
    });

    it("IMPLEMENT→FOCUSED_TEST 不增加循环计数", () => {
      const log = createStateLog();
      const updated = recordTransition(
        log,
        "IMPLEMENT",
        "FOCUSED_TEST",
        "首次运行",
      );
      assert.equal(updated.fixLoopCount, 0);
    });

    it("FOCUSED_TEST→IMPLEMENT 增加循环计数", () => {
      const log = createStateLog();
      const updated = recordTransition(
        log,
        "FOCUSED_TEST",
        "IMPLEMENT",
        "测试失败，回修",
      );
      assert.equal(updated.fixLoopCount, 1);
    });

    it("ADVERSARIAL_TEST→IMPLEMENT 增加循环计数", () => {
      const log = createStateLog();
      const updated = recordTransition(
        log,
        "ADVERSARIAL_TEST",
        "IMPLEMENT",
        "对抗测试失败",
      );
      assert.equal(updated.fixLoopCount, 1);
    });

    it("累计循环计数", () => {
      let log = createStateLog();
      log = recordTransition(log, "FOCUSED_TEST", "IMPLEMENT", "fail1");
      log = recordTransition(log, "FOCUSED_TEST", "IMPLEMENT", "fail2");
      log = recordTransition(log, "ADVERSARIAL_TEST", "IMPLEMENT", "fail3");
      assert.equal(log.fixLoopCount, 3);
    });

    it("不修改原始日志（不可变）", () => {
      const log = createStateLog();
      recordTransition(log, "UNDERSTAND", "BASELINE", "test");
      assert.equal(log.entries.length, 0);
    });
  });

  describe("validateWorkerLoop", () => {
    it("L0 无需测试即完整", () => {
      const log = createStateLog();
      // 只需到达 HANDOFF
      const updated = recordTransition(log, "UNDERSTAND", "HANDOFF", "done");
      const result = validateWorkerLoop(updated, "L0");
      assert.equal(result.complete, true);
    });

    it("L2 缺少 APP_TEST 不完整", () => {
      let log = createStateLog();
      log = recordTransition(log, "UNDERSTAND", "BASELINE", "start");
      log = recordTransition(log, "BASELINE", "REPRODUCE", "baseline");
      log = recordTransition(log, "REPRODUCE", "IMPLEMENT", "red");
      log = recordTransition(log, "IMPLEMENT", "FOCUSED_TEST", "code");
      log = recordTransition(log, "FOCUSED_TEST", "ADVERSARIAL_TEST", "focused ok");
      log = recordTransition(log, "ADVERSARIAL_TEST", "HANDOFF", "skip app");
      const result = validateWorkerLoop(log, "L2");
      assert.equal(result.complete, false);
      assert.ok(result.missingStates.includes("APP_TEST"));
    });

    it("L3 全部通过才完整", () => {
      let log = createStateLog();
      log = recordTransition(log, "UNDERSTAND", "BASELINE", "start");
      log = recordTransition(log, "BASELINE", "IMPLEMENT", "skip repro");
      log = recordTransition(log, "IMPLEMENT", "FOCUSED_TEST", "code done");
      log = recordTransition(log, "FOCUSED_TEST", "ADVERSARIAL_TEST", "focused ok");
      log = recordTransition(log, "ADVERSARIAL_TEST", "APP_TEST", "adversarial ok");
      log = recordTransition(log, "APP_TEST", "REGRESSION", "app ok");
      log = recordTransition(log, "REGRESSION", "HANDOFF", "all done");
      const result = validateWorkerLoop(log, "L3");
      assert.equal(result.complete, true);
      assert.equal(result.missingStates.length, 0);
    });

    it("循环耗尽视为不完整", () => {
      let log = createStateLog();
      // 模拟 5 次回环
      for (let i = 0; i < 5; i++) {
        log = recordTransition(log, "FOCUSED_TEST", "IMPLEMENT", `fail${i}`);
      }
      log = recordTransition(log, "IMPLEMENT", "HANDOFF", "give up");
      const result = validateWorkerLoop(log, "L1");
      assert.equal(result.complete, false);
      assert.equal(result.loopExhausted, true);
    });
  });

  describe("formatStateLog", () => {
    it("生成可读摘要", () => {
      let log = createStateLog();
      log = recordTransition(log, "UNDERSTAND", "BASELINE", "理解完成");
      log = recordTransition(log, "BASELINE", "IMPLEMENT", "基线建立");
      const text = formatStateLog(log);
      assert.ok(text.includes("UNDERSTAND → BASELINE"));
      assert.ok(text.includes("BASELINE → IMPLEMENT"));
      assert.ok(text.includes("修复循环次数"));
    });
  });
});

// ═══════════════════════════════════════════════════════════
// IMPL-06: 报告验证
// ═══════════════════════════════════════════════════════════

describe("报告验证 (IMPL-06)", () => {
  describe("validateReportProvenance", () => {
    it("完整 provenance 返回空", () => {
      const report = createPassReport(
        {
          commit: "a".repeat(40),
          promptVersion: "v2.1",
          model: "deepseek-v3",
          config: "mock",
          datasetVersion: "v2.1.0",
          seed: 42,
          judgeProvenance: "deepseek-v3@v1",
          timestamp: new Date().toISOString(),
        },
        [],
        "test",
      );
      assert.deepEqual(validateReportProvenance(report), []);
    });

    it("缺失 commit 被检测", () => {
      const report = createPassReport(
        {
          commit: "short",
          promptVersion: "v2",
          model: "deepseek",
          config: "mock",
          datasetVersion: "v2",
          seed: 1,
          judgeProvenance: "gpt@v1",
          timestamp: "",
        },
        [],
        "test",
      );
      const missing = validateReportProvenance(report);
      assert.ok(missing.some((m) => m.includes("commit")));
    });

    it("默认 promptVersion 被检测", () => {
      const report = createPassReport(
        {
          commit: "a".repeat(40),
          promptVersion: "default",
          model: "deepseek",
          config: "mock",
          datasetVersion: "v2",
          seed: 1,
          judgeProvenance: "gpt@v1",
          timestamp: "",
        },
        [],
        "test",
      );
      const missing = validateReportProvenance(report);
      assert.ok(missing.some((m) => m.includes("promptVersion")));
    });

    it("unknown model 被检测", () => {
      const report = createPassReport(
        {
          commit: "a".repeat(40),
          promptVersion: "v2",
          model: "unknown",
          config: "mock",
          datasetVersion: "v2",
          seed: 1,
          judgeProvenance: "gpt@v1",
          timestamp: "",
        },
        [],
        "test",
      );
      const missing = validateReportProvenance(report);
      assert.ok(missing.some((m) => m.includes("model")));
    });
  });

  describe("checkReportIntegrity", () => {
    it("完整报告通过", () => {
      const ctx = createAgentContext("test");
      const report = createPassReport(ctx.provenance, [], "test");
      const result = checkReportIntegrity(report);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it("verdict=pass 但 failures 非空 → 矛盾", () => {
      const ctx = createAgentContext("test");
      const report = createPassReport(ctx.provenance, [], "test");
      report.failures = ["some failure"];
      const result = checkReportIntegrity(report);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes("矛盾")));
    });

    it("缺失 provenance 产生 warning", () => {
      const report = createPassReport(
        {
          commit: "short",
          promptVersion: "default",
          model: "unknown",
          config: "default",
          datasetVersion: "current",
          seed: 0,
          judgeProvenance: "unknown@current",
          timestamp: "",
        },
        [],
        "test",
      );
      const result = checkReportIntegrity(report);
      assert.ok(result.warnings.length > 0);
      assert.ok(result.warnings.some((w) => w.includes("Provenance")));
      // warnings 不阻止 valid
      assert.equal(result.valid, true);
    });

    it("无效 verdict 被检测", () => {
      const report = createPassReport(
        {
          commit: "a".repeat(40),
          promptVersion: "v2",
          model: "deepseek",
          config: "mock",
          datasetVersion: "v2",
          seed: 1,
          judgeProvenance: "gpt@v1",
          timestamp: "",
        },
        [],
        "test",
      );
      (report as Record<string, unknown>).verdict = "unknown";
      const result = checkReportIntegrity(report);
      assert.equal(result.valid, false);
    });
  });
});

/**
 * 任务系统全链路契约测试
 *
 * 只测生产路径：
 * - canTransitionStatus / isTerminalStatus / checkStatusTransition
 * - detectTaskCompletion / extractNarrativeKeywords
 *
 * 2026-07 重构：移除 QuestState 死代码测试，移除 rewardDelivery 测试（废弃），
 * 移除 questChain 测试（废弃），简化 makeTask 到 GameTaskV2 最小字段。
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  canTransitionStatus,
  isTerminalStatus,
  checkStatusTransition,
} from "./taskStateMachine";

import {
  detectTaskCompletion,
  extractNarrativeKeywords,
  type CompletionGameState,
  type CompletionDetectionInput,
} from "./completionDetector";

import { normalizeGameTaskDraft, type GameTaskV2 } from "./taskV2";

// === 测试辅助：快速创建任务 ===

function makeTask(overrides: Partial<GameTaskV2> = {}): GameTaskV2 {
  const base = normalizeGameTaskDraft({
    id: "T001",
    title: "测试任务",
    desc: "这是一个测试任务",
    type: "character",
    issuerId: "N-007",
    issuerName: "廖暗",
    reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
    ...overrides,
  });
  if (!base) throw new Error("normalizeGameTaskDraft returned null");
  return base;
}

function makeCompletionState(overrides: Partial<CompletionGameState> = {}): CompletionGameState {
  return {
    inventoryItemIds: ["bandage", "old_key"],
    playerLocation: "B1_Classroom_Corridor",
    presentNpcIds: ["N-007", "N-015"],
    completedTaskIds: [],
    recentNarrativeKeywords: [],
    originium: 3,
    codexNpcIds: ["N-007", "N-015"],
    ...overrides,
  };
}

// ============================================================
// Phase 1: 状态机测试（生产路径）
// ============================================================

describe("任务状态机（生产路径）", () => {
  describe("canTransitionStatus 合法性表", () => {
    it("hidden → available 合法", () => {
      assert.equal(canTransitionStatus("hidden", "available"), true);
    });
    it("hidden → active 合法", () => {
      assert.equal(canTransitionStatus("hidden", "active"), true);
    });
    it("available → active 合法", () => {
      assert.equal(canTransitionStatus("available", "active"), true);
    });
    it("active → completed 合法", () => {
      assert.equal(canTransitionStatus("active", "completed"), true);
    });
    it("active → failed 合法", () => {
      assert.equal(canTransitionStatus("active", "failed"), true);
    });
    it("available → completed 合法（auto 完成路径）", () => {
      assert.equal(canTransitionStatus("available", "completed"), true);
    });
    it("available → failed 合法（DM 显式失败）", () => {
      assert.equal(canTransitionStatus("available", "failed"), true);
    });
    it("completed → active 非法（终态不可逆）", () => {
      assert.equal(canTransitionStatus("completed", "active"), false);
    });
    it("completed → failed 非法", () => {
      assert.equal(canTransitionStatus("completed", "failed"), false);
    });
    it("failed → active 非法（终态不可逆）", () => {
      assert.equal(canTransitionStatus("failed", "active"), false);
    });
    it("failed → completed 非法", () => {
      assert.equal(canTransitionStatus("failed", "completed"), false);
    });
    it("hidden → completed 非法（跳级）", () => {
      assert.equal(canTransitionStatus("hidden", "completed"), false);
    });
    it("hidden → failed 非法（跳级）", () => {
      assert.equal(canTransitionStatus("hidden", "failed"), false);
    });
  });

  describe("isTerminalStatus 终态判断", () => {
    it("completed/failed 为终态", () => {
      assert.equal(isTerminalStatus("completed"), true);
      assert.equal(isTerminalStatus("failed"), true);
    });
    it("hidden/available/active 非终态", () => {
      assert.equal(isTerminalStatus("hidden"), false);
      assert.equal(isTerminalStatus("available"), false);
      assert.equal(isTerminalStatus("active"), false);
    });
  });

  describe("checkStatusTransition 统一守卫", () => {
    it("合法转移 → allowed=true", () => {
      const task = makeTask({ status: "available" });
      const r = checkStatusTransition(task, "active");
      assert.equal(r.allowed, true);
    });

    it("终态锁：completed 不可修改", () => {
      const task = makeTask({ status: "completed" });
      const r = checkStatusTransition(task, "active");
      assert.equal(r.allowed, false);
      assert.ok(r.blockedReason?.includes("terminal"));
      assert.equal(r.flag, "task_illegal_transition_blocked");
    });

    it("终态锁：failed 不可修改", () => {
      const task = makeTask({ status: "failed" });
      const r = checkStatusTransition(task, "completed");
      assert.equal(r.allowed, false);
    });

    it("same → same 终态 identity 返回 false（无状态变更）", () => {
      const task = makeTask({ status: "completed" });
      const r = checkStatusTransition(task, "completed");
      assert.equal(r.allowed, false);
    });

    it("same → same 非终态 identity 也返回 false", () => {
      const task = makeTask({ status: "active" });
      const r = checkStatusTransition(task, "active");
      assert.equal(r.allowed, false);
    });

    it("非法转移（跳级）→ blocked", () => {
      const task = makeTask({ status: "hidden" });
      const r = checkStatusTransition(task, "completed");
      assert.equal(r.allowed, false);
      assert.ok(r.blockedReason?.includes("invalid_transition"));
    });
  });
});

// ============================================================
// Phase 2: 完成检测测试
// ============================================================

describe("任务完成检测", () => {
  it("DM JSON 结构化标记 → 高置信度完成", () => {
    const task = makeTask({ id: "T001", title: "测试任务" });
    const result = detectTaskCompletion({
      task,
      narrative: "一些叙事文本",
      dmTaskUpdates: [{ taskId: "T001", status: "completed" }],
      gameState: makeCompletionState(),
    });
    assert.equal(result.objectivesMet, true);
    assert.equal(result.detectionMethod, "structured");
    assert.ok(result.confidence >= 0.85);
  });

  it("叙事文本反向检测 → 中置信度完成", () => {
    const task = makeTask({ id: "T001", title: "寻找旧钥匙" });
    const result = detectTaskCompletion({
      task,
      narrative: "我终于在储物柜的夹层里找到了那把旧钥匙，它卡在生锈的铰链后面。",
      dmTaskUpdates: [],
      gameState: makeCompletionState(),
    });
    // 叙事中有"终于找到" + 匹配 title keywords
    assert.equal(result.objectivesMet, true);
    assert.equal(result.detectionMethod, "narrative");
  });

  it("无结构化标记 + 无关叙事 → 未完成", () => {
    const task = makeTask({ id: "T001", title: "寻找旧钥匙" });
    const result = detectTaskCompletion({
      task,
      narrative: "我沿着走廊走了一段路，什么都没发现。",
      dmTaskUpdates: [],
      gameState: makeCompletionState(),
    });
    assert.equal(result.objectivesMet, false);
    assert.equal(result.detectionMethod, "none");
  });

  it("requiredItemIds 未满足 → 不可交付", () => {
    const task = makeTask({ id: "T001", requiredItemIds: ["ancient_seal"] });
    const result = detectTaskCompletion({
      task,
      narrative: "任务完成了！",
      dmTaskUpdates: [{ taskId: "T001", status: "completed" }],
      gameState: makeCompletionState({ inventoryItemIds: ["bandage"] }),
    });
    assert.equal(result.objectivesMet, true);
    assert.equal(result.isDeliverable, false);
  });

  it("requiredItemIds 全部满足 → 可交付", () => {
    const task = makeTask({ id: "T001", requiredItemIds: ["old_key"] });
    const result = detectTaskCompletion({
      task,
      narrative: "拿到了钥匙。",
      dmTaskUpdates: [{ taskId: "T001", status: "completed" }],
      gameState: makeCompletionState({ inventoryItemIds: ["old_key"] }),
    });
    assert.equal(result.objectivesMet, true);
    assert.equal(result.isDeliverable, true);
  });

  it("叙事关键词提取：NPC 名称 + 位置 + 物品", () => {
    const keywords = extractNarrativeKeywords(
      "廖暗在配电间里找到了旧钥匙，把它递给了我。我在走廊尽头看见麟泽正在登记口和欣蓝说话。"
    );
    assert.ok(keywords.some((k) => k.includes("廖暗")));
    assert.ok(keywords.some((k) => k.includes("麟泽")));
    assert.ok(keywords.some((k) => k.includes("配电间")));
    assert.ok(keywords.some((k) => k.includes("登记口")));
  });

  it("空叙事 → 空关键词", () => {
    const keywords = extractNarrativeKeywords("");
    assert.equal(keywords.length, 0);
  });

  it("完成检测不修改输入参数", () => {
    const task = makeTask({ id: "T001", title: "测试任务" });
    const gameState = makeCompletionState();
    const narrative = "任务完成。";
    const originalKwCount = gameState.recentNarrativeKeywords.length;

    const result = detectTaskCompletion({
      task,
      narrative,
      dmTaskUpdates: [{ taskId: "T001", status: "completed" }],
      gameState,
    });

    assert.equal(result.objectivesMet, true);
    // 副作用消除：输入参数不应被修改
    assert.equal(gameState.recentNarrativeKeywords.length, originalKwCount);
  });
});

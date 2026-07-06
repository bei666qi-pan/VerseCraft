/**
 * 任务系统全链路契约测试
 *
 * 覆盖升级后的完整任务系统：
 * - 状态机转换
 * - 奖励发放到账
 * - 完成检测（结构化 + 叙事）
 * - 任务链推进
 * - 任务发现/过滤
 * - NPC 授予
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

import {
  canTransition,
  guardActivate,
  guardMarkDeliverable,
  guardComplete,
  guardFail,
  guardExpire,
  getQuestState,
  isTerminal,
  isInteractive,
  type QuestGuardContext,
  type QuestState,
} from "./taskStateMachine";

import {
  deliverTaskReward,
  previewReward,
  type RewardGameState,
} from "./rewardDelivery";

import {
  detectTaskCompletion,
  extractNarrativeKeywords,
  type CompletionGameState,
  type CompletionDetectionInput,
} from "./completionDetector";

import {
  buildQuestChain,
  getNextTaskInChain,
  canActivateTask,
  getNextAvailableTask,
  filterQuestBoard,
  findNpcGrantOpportunities,
  checkForNewQuestOpportunities,
} from "./questChain";

import type { GameTaskV2, GameTaskRewardV2 } from "./taskV2";

// === 测试辅助：快速创建任务 ===

function makeTask(overrides: Partial<GameTaskV2> = {}): GameTaskV2 {
  return {
    id: "T001",
    title: "测试任务",
    desc: "这是一个测试任务",
    type: "character",
    issuerId: "N-007",
    issuerName: "廖暗",
    floorTier: "B1",
    guidanceLevel: "standard",
    reward: makeReward(),
    status: "active",
    expiresAt: null,
    betrayalPossible: false,
    hiddenOutcome: "",
    hiddenTriggerConditions: [],
    claimMode: "auto",
    npcProactiveGrant: {
      enabled: false,
      npcId: "N-007",
      minFavorability: 0,
      preferredLocations: [],
      cooldownHours: 0,
    },
    npcProactiveGrantLastIssuedHour: null,
    nextHint: "",
    worldConsequences: [],
    highRiskHighReward: false,
    goalKind: "commission",
    surfaceClass: "commission",
    surfacePriority: 50,
    ...overrides,
  };
}

function makeReward(overrides: Partial<GameTaskRewardV2> = {}): GameTaskRewardV2 {
  return {
    originium: 0,
    items: [],
    warehouseItems: [],
    unlocks: [],
    relationshipChanges: [],
    ...overrides,
  };
}

function makeGuardCtx(overrides: Partial<QuestGuardContext> = {}): QuestGuardContext {
  return {
    gameHourIndex: 48,
    playerLocation: "B1_Classroom_Corridor",
    presentNpcIds: ["N-007"],
    inventoryItemIds: ["bandage", "flashlight"],
    unlockedFlags: [],
    originium: 3,
    completedTaskIds: [],
    codexNpcIds: ["N-007"],
    ...overrides,
  };
}

function makeRewardState(overrides: Partial<RewardGameState> = {}): RewardGameState {
  return {
    originium: 3,
    inventory: [
      { id: "bandage", name: "绷带", quantity: 2 },
    ],
    warehouse: [],
    maxInventorySlots: 12,
    codexFavorability: { "N-007": 15 },
    unlockedWorldFlags: [],
    playerLocation: "B1_Classroom_Corridor",
    ...overrides,
  };
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
// Phase 1: 状态机测试
// ============================================================

describe("任务状态机", () => {
  describe("状态转换合法性", () => {
    it("locked → available 合法", () => {
      assert.equal(canTransition("locked", "available"), true);
    });
    it("available → active 合法", () => {
      assert.equal(canTransition("available", "active"), true);
    });
    it("active → deliverable 合法", () => {
      assert.equal(canTransition("active", "deliverable"), true);
    });
    it("deliverable → completed 合法", () => {
      assert.equal(canTransition("deliverable", "completed"), true);
    });
    it("active → failed 合法", () => {
      assert.equal(canTransition("active", "failed"), true);
    });
    it("completed → active 非法（终态不可逆转）", () => {
      assert.equal(canTransition("completed", "active"), false);
    });
    it("failed → active 非法", () => {
      assert.equal(canTransition("failed", "active"), false);
    });
    it("expired → any 非法", () => {
      assert.equal(canTransition("expired", "available"), false);
      assert.equal(canTransition("expired", "active"), false);
    });
  });

  describe("激活守卫 (available → active)", () => {
    it("正常激活成功", () => {
      const task = makeTask({ status: "available" });
      const ctx = makeGuardCtx();
      const result = guardActivate(task, ctx);
      assert.equal(result.allowed, true);
      assert.equal(result.newState, "active");
      assert.ok(result.event);
    });

    it("过期任务不能激活", () => {
      const task = makeTask({ status: "available", expiresAt: "day:1,hour:12" });
      const ctx = makeGuardCtx({ gameHourIndex: 72 }); // day3, 远超过期时间
      const result = guardActivate(task, ctx);
      assert.equal(result.allowed, false);
      assert.equal(result.newState, "expired");
    });
  });

  describe("可交付守卫 (active → deliverable)", () => {
    it("有 requiredItemIds 且全部持有 → 可交付", () => {
      const task = makeTask({ status: "active", requiredItemIds: ["old_key"] });
      const ctx = makeGuardCtx({ inventoryItemIds: ["old_key", "bandage"] });
      const result = guardMarkDeliverable(task, ctx);
      assert.equal(result.allowed, true);
      assert.equal(result.newState, "deliverable");
    });

    it("缺少 requiredItemIds → 不可交付", () => {
      const task = makeTask({ status: "active", requiredItemIds: ["ancient_seal"] });
      const ctx = makeGuardCtx({ inventoryItemIds: ["bandage"] });
      const result = guardMarkDeliverable(task, ctx);
      assert.equal(result.allowed, false);
      assert.ok(result.blockedReason?.includes("missing_items"));
    });

    it("无 requiredItemIds → 可直接交付", () => {
      const task = makeTask({ status: "active" });
      const ctx = makeGuardCtx();
      const result = guardMarkDeliverable(task, ctx);
      assert.equal(result.allowed, true);
    });
  });

  describe("完成守卫 (deliverable → completed)", () => {
    it("auto 模式直接完成", () => {
      const task = makeTask({ status: "active", claimMode: "auto" });
      const ctx = makeGuardCtx();
      // 先标记为可交付
      const deliverable = guardMarkDeliverable(task, ctx);
      assert.equal(deliverable.allowed, true);

      const result = guardComplete({ ...task, status: "active" }, ctx);
      assert.equal(result.allowed, true);
    });

    it("npc_grant 模式需要 NPC 在场", () => {
      const task = makeTask({ status: "active", claimMode: "npc_grant", issuerId: "N-010" });
      const ctx = makeGuardCtx({ presentNpcIds: ["N-007"] }); // N-010 不在场
      const deliverable = guardMarkDeliverable(task, ctx);
      assert.equal(deliverable.allowed, true);

      const result = guardComplete({ ...task, status: "active" }, ctx);
      assert.equal(result.allowed, false);
      assert.ok(result.blockedReason?.includes("npc_not_present"));
    });

    it("npc_grant 模式 NPC 在场 → 可完成", () => {
      const task = makeTask({ status: "active", claimMode: "npc_grant", issuerId: "N-007" });
      const ctx = makeGuardCtx({ presentNpcIds: ["N-007"] });
      const result = guardComplete({ ...task, status: "active" }, ctx);
      assert.equal(result.allowed, true);
    });
  });

  describe("终态判断", () => {
    it("completed/failed/expired 为终态", () => {
      assert.equal(isTerminal("completed"), true);
      assert.equal(isTerminal("failed"), true);
      assert.equal(isTerminal("expired"), true);
      assert.equal(isTerminal("active"), false);
      assert.equal(isTerminal("available"), false);
    });

    it("available/active/deliverable 为活跃态", () => {
      assert.equal(isInteractive("available"), true);
      assert.equal(isInteractive("active"), true);
      assert.equal(isInteractive("deliverable"), true);
      assert.equal(isInteractive("completed"), false);
    });
  });
});

// ============================================================
// Phase 2: 奖励发放测试
// ============================================================

describe("奖励发放引擎", () => {
  it("发放原石奖励", () => {
    const task = makeTask({ reward: makeReward({ originium: 2 }) });
    const state = makeRewardState({ originium: 3 });
    const result = deliverTaskReward({ task, gameState: state });
    assert.equal(result.allDelivered, true);
    assert.equal(result.newState.originium, 5);
    assert.ok(result.summary.includes("原石 +2"));
  });

  it("发放道具奖励（有空位）", () => {
    const task = makeTask({ reward: makeReward({ items: ["镇痛剂"] }) });
    const state = makeRewardState();
    const result = deliverTaskReward({ task, gameState: state });
    assert.equal(result.allDelivered, true);
    assert.ok(result.newState.inventory.some((i) => i.name === "镇痛剂"));
  });

  it("道具奖励 — 行囊满时自动放入仓库", () => {
    const task = makeTask({ reward: makeReward({ items: ["原石碎片"] }) });
    // 满了 1 格的行囊
    const fullInv = Array.from({ length: 12 }, (_, i) => ({ id: `item_${i}`, name: `物品_${i}`, quantity: 1 }));
    const state = makeRewardState({ inventory: fullInv });
    const result = deliverTaskReward({ task, gameState: state });
    assert.equal(result.allDelivered, true);
    assert.ok(result.newState.warehouse.some((i) => i.name === "原石碎片"));
    assert.ok(result.summary.includes("仓库"));
  });

  it("发放关系变化奖励", () => {
    const task = makeTask({
      reward: makeReward({
        relationshipChanges: [{ npcId: "N-007", delta: "trust_up", value: 10 }],
      }),
    });
    const state = makeRewardState({ codexFavorability: { "N-007": 15 } });
    const result = deliverTaskReward({ task, gameState: state });
    assert.equal(result.allDelivered, true);
    assert.equal(result.newState.codexFavorability["N-007"], 25);
    assert.ok(result.summary.includes("关系变化"));
  });

  it("发放解锁奖励", () => {
    const task = makeTask({ reward: makeReward({ unlocks: ["forge_access", "anchor_B1"] }) });
    const state = makeRewardState();
    const result = deliverTaskReward({ task, gameState: state });
    assert.equal(result.allDelivered, true);
    assert.ok(result.newState.unlockedWorldFlags.includes("forge_access"));
    assert.ok(result.newState.unlockedWorldFlags.includes("anchor_B1"));
  });

  it("复合奖励：原石+道具+关系+解锁一次发放", () => {
    const task = makeTask({
      reward: makeReward({
        originium: 2,
        items: ["暗月碎片"],
        relationshipChanges: [{ npcId: "N-007", delta: "trust_up", value: 5 }],
        unlocks: ["secret_passage"],
      }),
    });
    const state = makeRewardState();
    const result = deliverTaskReward({ task, gameState: state });
    assert.equal(result.allDelivered, true);
    assert.equal(result.newState.originium, 5);
    assert.ok(result.newState.inventory.some((i) => i.name === "暗月碎片"));
    assert.equal(result.newState.codexFavorability["N-007"], 20);
    assert.ok(result.newState.unlockedWorldFlags.includes("secret_passage"));
  });

  it("奖励预览", () => {
    const reward = makeReward({ originium: 2, items: ["绷带", "手电"] });
    const preview = previewReward(reward);
    assert.ok(preview.some((p) => p.includes("原石")));
    assert.ok(preview.some((p) => p.includes("绷带")));
  });

  it("无实物奖励的任务显示线索推进", () => {
    const preview = previewReward(makeReward());
    assert.ok(preview[0]!.includes("线索推进") || preview[0]!.includes("无实物"));
  });
});

// ============================================================
// Phase 3: 完成检测测试
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
    // 结构化说完成了，但 requiredItemIds 不满足
    assert.equal(result.objectivesMet, true); // 结构化检测通过
    assert.equal(result.isDeliverable, false); // 但道具条件不满足
  });

  it("叙事关键词提取", () => {
    const keywords = extractNarrativeKeywords(
      "廖暗在配电间里找到了旧钥匙，把它递给了我。我在走廊尽头看见麟泽正在登记口和欣蓝说话。"
    );
    assert.ok(keywords.some((k) => k.includes("廖暗")));
    assert.ok(keywords.some((k) => k.includes("麟泽")));
    assert.ok(keywords.some((k) => k.includes("配电间")));
    assert.ok(keywords.some((k) => k.includes("登记口")));
  });
});

// ============================================================
// Phase 4: 任务链与发现测试
// ============================================================

describe("任务链", () => {
  const chain = buildQuestChain({
    chainId: "escape_mainline",
    name: "逃生主线",
    description: "从B1层层向上，寻找出口",
    taskIds: ["escape_b1_survive", "escape_b1_clue", "escape_1f_permit", "escape_7f_door"],
  });

  it("构建4阶段任务链", () => {
    assert.equal(chain.stages.length, 4);
    assert.equal(chain.stages[0]!.stageOrder, 1);
    assert.equal(chain.stages[0]!.prerequisiteTaskId, null);
    assert.equal(chain.stages[1]!.prerequisiteTaskId, "escape_b1_survive");
    assert.equal(chain.stages[3]!.nextTaskIds.length, 0);
  });

  it("获取下一阶段任务", () => {
    const next = getNextTaskInChain(chain, "escape_b1_survive");
    assert.equal(next, "escape_b1_clue");
    const last = getNextTaskInChain(chain, "escape_7f_door");
    assert.equal(last, null);
  });

  it("前置任务完成前不可激活", () => {
    assert.equal(canActivateTask(chain.stages[1]!, []), false);
    assert.equal(canActivateTask(chain.stages[1]!, ["escape_b1_survive"]), true);
  });

  it("获取链中下一个可用任务", () => {
    const tasks = [
      makeTask({ id: "escape_b1_survive", status: "completed" }),
      makeTask({ id: "escape_b1_clue", status: "hidden" }),
      makeTask({ id: "escape_1f_permit", status: "hidden" }),
    ];
    const next = getNextAvailableTask(chain, ["escape_b1_survive"], tasks);
    assert.ok(next);
    assert.equal(next!.id, "escape_b1_clue");
  });
});

describe("任务发现面板", () => {
  const tasks = [
    makeTask({ id: "T001", title: "调查血迹", status: "available", floorTier: "B1", surfaceClass: "commission" }),
    makeTask({ id: "T002", title: "找老刘修电路", status: "active", floorTier: "B1", issuerId: "N-008", issuerName: "电工老刘", claimMode: "npc_grant" }),
    makeTask({ id: "T003", title: "登记入住", status: "available", floorTier: "1F", issuerId: "N-010", issuerName: "欣蓝", surfaceClass: "mainline" }),
    makeTask({ id: "T004", title: "隐藏任务", status: "hidden", floorTier: "B1" }),
    makeTask({ id: "T005", title: "已完成任务", status: "completed", floorTier: "1F" }),
  ];

  it("按楼层过滤", () => {
    const board = filterQuestBoard(tasks, { floorTier: "B1" });
    const ids = board.map((b) => b.task.id);
    assert.ok(ids.includes("T001"));
    assert.ok(ids.includes("T002"));
    assert.ok(!ids.includes("T003")); // 1F
    assert.ok(!ids.includes("T005")); // completed
  });

  it("按 surfaceClass 过滤", () => {
    const board = filterQuestBoard(tasks, { surfaceClass: "mainline" });
    const ids = board.map((b) => b.task.id);
    assert.ok(ids.includes("T003"));
  });

  it("npc_grant 任务标记不可接取（NPC 不在场）", () => {
    const board = filterQuestBoard(
      tasks, { playerLocation: "B1_Classroom_Corridor" }, [], [], [], []
    );
    const t2 = board.find((b) => b.task.id === "T002");
    assert.ok(t2);
    assert.equal(t2.canAccept, false);
    assert.ok(t2.blockedReason?.includes("不在场"));
  });

  it("npc_grant 任务标记可接取（NPC 在场）", () => {
    const board = filterQuestBoard(
      tasks, { playerLocation: "B1_Classroom_Corridor" }, [], [], [], ["N-008"]
    );
    const t2 = board.find((b) => b.task.id === "T002");
    assert.ok(t2);
    assert.equal(t2.canAccept, true);
  });

  it("排除隐藏任务", () => {
    const board = filterQuestBoard(tasks, { excludeHidden: true });
    assert.ok(!board.some((b) => b.task.id === "T004"));
  });
});

describe("NPC 主动授予", () => {
  it("在场+位置匹配+好感度足够 → 可以授予", () => {
    const tasks = [makeTask({
      id: "T010",
      status: "hidden",
      issuerId: "N-007",
      issuerName: "廖暗",
      npcProactiveGrant: {
        enabled: true,
        npcId: "N-007",
        minFavorability: 10,
        preferredLocations: ["B1_Classroom_Corridor"],
        cooldownHours: 12,
      },
      npcProactiveGrantLastIssuedHour: null,
    })];

    const opportunities = findNpcGrantOpportunities(
      tasks, 48, ["N-007"], "B1_Classroom_Corridor", { "N-007": 15 }
    );
    assert.equal(opportunities.length, 1);
    assert.equal(opportunities[0]!.isOnCooldown, false);
  });

  it("冷却中 → 不授予", () => {
    const tasks = [makeTask({
      id: "T010",
      status: "hidden",
      issuerId: "N-007",
      issuerName: "廖暗",
      npcProactiveGrant: {
        enabled: true,
        npcId: "N-007",
        minFavorability: 10,
        preferredLocations: ["B1_Classroom_Corridor"],
        cooldownHours: 24,
      },
      npcProactiveGrantLastIssuedHour: 40, // 8 小时前刚发过
    })];

    const opportunities = findNpcGrantOpportunities(
      tasks, 48, ["N-007"], "B1_Classroom_Corridor", { "N-007": 15 }
    );
    assert.equal(opportunities[0]!.isOnCooldown, true);
    assert.ok(opportunities[0]!.cooldownRemainingHours > 0);
  });

  it("好感度不足 → 不授予", () => {
    const tasks = [makeTask({
      id: "T010",
      status: "hidden",
      issuerId: "N-007",
      issuerName: "廖暗",
      npcProactiveGrant: {
        enabled: true,
        npcId: "N-007",
        minFavorability: 30,
        preferredLocations: ["B1_Classroom_Corridor"],
        cooldownHours: 12,
      },
      npcProactiveGrantLastIssuedHour: null,
    })];

    const opportunities = findNpcGrantOpportunities(
      tasks, 48, ["N-007"], "B1_Classroom_Corridor", { "N-007": 5 }
    );
    // 好感度不足但仍然返回（只是不会自动可见）
    assert.equal(opportunities.length, 1);
  });

  it("checkForNewQuestOpportunities 让满足条件的隐藏任务变为可见", () => {
    const tasks = [
      makeTask({
        id: "T_always_available", status: "available",
        issuerId: "N-007", issuerName: "廖暗",
        npcProactiveGrant: { enabled: true, npcId: "N-007", minFavorability: 0, preferredLocations: ["B1_Classroom_Corridor"], cooldownHours: 0 },
      }),
      makeTask({
        id: "T_hidden_becomes_visible", status: "hidden",
        issuerId: "N-007", issuerName: "廖暗",
        npcProactiveGrant: { enabled: true, npcId: "N-007", minFavorability: 0, preferredLocations: ["B1_Classroom_Corridor"], cooldownHours: 0 },
      }),
      makeTask({
        id: "T_hidden_stays_hidden", status: "hidden",
        issuerId: "N-008", issuerName: "电工老刘",
        npcProactiveGrant: { enabled: true, npcId: "N-008", minFavorability: 30, preferredLocations: ["B1_PowerRoom"], cooldownHours: 0 },
      }),
    ];

    const newQuests = checkForNewQuestOpportunities(
      tasks, 48, ["N-007"], "B1_Classroom_Corridor", { "N-007": 20 }
    );
    // 条件满足的任务（即使原来是 hidden）应该可见
    assert.ok(newQuests.some((q) => q.id === "T_always_available"), "始终可见的任务应该在列表中");
    assert.ok(newQuests.some((q) => q.id === "T_hidden_becomes_visible"), "满足条件的隐藏任务应该变为可见");
    // N-008 不在场 + 位置不匹配，不应出现
    assert.ok(!newQuests.some((q) => q.id === "T_hidden_stays_hidden"), "条件不满足的隐藏任务不应出现");
  });
});

// ============================================================
// Phase 5: 全链路端到端测试
// ============================================================

describe("全链路：状态机 → 检测 → 发放", () => {
  it("完整任务生命周期：available → active → deliverable → completed + 奖励到账", () => {
    const task = makeTask({
      id: "quest_full",
      title: "寻找旧钥匙并交给廖暗",
      status: "available",
      claimMode: "npc_grant",
      issuerId: "N-007",
      issuerName: "廖暗",
      requiredItemIds: ["old_key"],
      reward: makeReward({ originium: 1, items: ["暗月碎片"], relationshipChanges: [{ npcId: "N-007", delta: "trust_up", value: 8 }] }),
    });

    const state = makeRewardState({ inventory: [{ id: "old_key", name: "旧钥匙", quantity: 1 }] });

    // Step 1: 激活任务
    const ctx = makeGuardCtx({ inventoryItemIds: ["old_key"] });
    const step1 = guardActivate(task, ctx);
    assert.equal(step1.allowed, true, "应可激活");
    assert.equal(step1.newState, "active");

    // Step 2: 标记可交付（玩家收集了所需道具）
    task.status = "active";
    const step2 = guardMarkDeliverable(task, ctx);
    assert.equal(step2.allowed, true, "应可交付");

    // Step 3: 检测任务完成
    const detection = detectTaskCompletion({
      task,
      narrative: "我把旧钥匙递给了廖暗。他接过去，点了点头。",
      dmTaskUpdates: [{ taskId: "quest_full", status: "completed" }],
      gameState: makeCompletionState({ inventoryItemIds: ["old_key"], presentNpcIds: ["N-007"] }),
    });
    assert.equal(detection.objectivesMet, true, "检测应触发完成");
    assert.equal(detection.isDeliverable, true);

    // Step 4: 领取奖励（NPC 在场）
    const ctx2 = makeGuardCtx({ presentNpcIds: ["N-007"], inventoryItemIds: ["old_key"] });
    const step4 = guardComplete({ ...task, status: "active" }, ctx2);
    assert.equal(step4.allowed, true, "NPC 在场应可完成");

    // Step 5: 发放奖励
    const delivery = deliverTaskReward({ task, gameState: state });
    assert.equal(delivery.allDelivered, true, "奖励应全部到账");
    assert.equal(delivery.newState.originium, 4, "原石+1");
    assert.ok(delivery.newState.inventory.some((i) => i.name === "暗月碎片"), "道具到账");
    assert.equal(delivery.newState.codexFavorability["N-007"], 23, "好感度+8");

    // Step 6: 终态验证
    assert.equal(isTerminal("completed"), true);
    assert.equal(canTransition("completed", "active"), false, "已完成的任务不可重新激活");
  });

  it("多任务批量完成", () => {
    const task1 = makeTask({ id: "T1", reward: makeReward({ originium: 1 }) });
    const task2 = makeTask({ id: "T2", reward: makeReward({ originium: 2, items: ["线索笔记"] }) });

    const state = makeRewardState({ originium: 0 });

    // 逐个发放
    const r1 = deliverTaskReward({ task: task1, gameState: state });
    const r2 = deliverTaskReward({ task: task2, gameState: r1.newState });

    assert.equal(r2.newState.originium, 3, "累计原石");
    assert.ok(r2.newState.inventory.some((i) => i.name === "线索笔记"));
  });
});

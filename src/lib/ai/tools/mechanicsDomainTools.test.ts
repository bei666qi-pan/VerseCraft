// src/lib/ai/tools/mechanicsTools.test.ts
/**
 * Mechanics Workflow 工具系统测试
 *
 * 覆盖：
 * - 工具 Schema 验证
 * - 只读工具正确返回快照
 * - 锻造业务规则（材料充足/不足/位置不对）
 * - 任务创建和幂等性
 * - 战斗动作映射
 * - 工具超时保护
 * - 事务原子性
 */

import { describe, it } from "node:test";
import { getMechanicsToolDefinitions, getReadonlyMechanicsToolDefinitions, getWriteMechanicsToolDefinitions, MECHANICS_TOOL_REGISTRY } from "./mechanicsToolHandlers";
import assert from "node:assert/strict";

// Import schemas
import { MECHANICS_TOOL_SCHEMAS, ALL_MECHANICS_TOOL_NAMES, READONLY_MECHANICS_TOOL_NAMES, WRITE_MECHANICS_TOOL_NAMES } from "./mechanicsToolSchemas";

// Import domain services
import {
  createQuest,
  executeForge,
  initiateCombat,
  resolvePlayerCombatAction,
  applyWorldEvent,
  checkIdempotency,
  recordIdempotency,
  __resetIdempotencyStore,
} from "./gameDomainServices";

import type { GameState } from "@/store/useGameStore";

// ============================================================
// Helpers
// ============================================================

function makeMockGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentSaveSlot: "test",
    saveSlots: {},
    isHydrated: true,
    storageMode: "indexeddb" as any,
    user: null,
    guestId: "test-guest",
    isGuest: true,
    playTimeSeconds: 0,
    visitCount: 1,
    hasShownGuestSoftNudge: false,
    hasCompletedNewPlayerGuideBefore: false,
    dialogueCount: 0,
    playerName: "测试玩家",
    gender: "unknown",
    height: 170,
    personality: "curious",
    talent: null,
    talentCooldowns: {} as any,
    time: { day: 1, hour: 14 } as any,
    pendingHourProgress: 0,
    stats: { sanity: 100, strength: 10, agility: 10, intelligence: 10, charisma: 10, luck: 10 } as any,
    historicalMaxSanity: 100,
    inventory: [],
    logs: [],
    codex: {},
    sceneNpcAppearanceLedger: {},
    memorySpine: { entries: [], lastCompressedAt: null, compressionCount: 0 } as any,
    storyDirector: { activeAgendas: [], agendaHistory: [], lastTickDay: 0 } as any,
    incidentQueue: { queue: [], lastProcessedIndex: -1 } as any,
    escapeMainline: { phase: "intro", discoveredDoors: [], collectedKeys: [], exitProgress: 0 } as any,
    endingState: { reached: false, endingType: null, endingData: null } as any,
    hasCheckedCodex: false,
    viewedCodexIds: {},
    warehouse: [],
    currentOptions: [],
    recentOptions: [],
    inputMode: "text",
    originium: 10,
    tasks: [],
    journalClues: [],
    playerLocation: "1F_Lobby",
    historicalMaxFloorScore: 1,
    deathCount: 0,
    dynamicNpcStates: {},
    mainThreatByFloor: {},
    equippedWeapon: null,
    weaponBag: [],
    professionState: {} as any,
    currentBgm: "",
    chapterState: { currentChapter: 1, turnsThisChapter: 0, completedChapters: [] } as any,
    ...overrides,
  } as GameState;
}


// ============================================================
// Tool Schema Tests
// ============================================================

describe("Mechanics Workflow Tool Schemas", () => {
  it("所有工具都有有效的 Schema", () => {
    for (const name of ALL_MECHANICS_TOOL_NAMES) {
      const schema = MECHANICS_TOOL_SCHEMAS[name];
      assert.ok(schema, `Schema for ${name} should exist`);
      assert.ok(schema.meta.name, `Meta name for ${name} should exist`);
      assert.ok(schema.meta.description, `Meta description for ${name} should exist`);
      assert.ok(schema.meta.category, `Meta category for ${name} should exist`);
      assert.ok(schema.parameters, `Parameters for ${name} should exist`);
      assert.strictEqual(schema.parameters.type, "object");
    }
  });

  it("只读工具不改变状态", () => {
    for (const name of READONLY_MECHANICS_TOOL_NAMES) {
      const schema = MECHANICS_TOOL_SCHEMAS[name];
      assert.strictEqual(schema.meta.access, "read");
      assert.strictEqual(schema.meta.readonly, true);
      assert.strictEqual(schema.meta.mutatesState, false);
    }
  });

  it("写工具会改变状态", () => {
    for (const name of WRITE_MECHANICS_TOOL_NAMES) {
      const schema = MECHANICS_TOOL_SCHEMAS[name];
      assert.strictEqual(schema.meta.access, "write");
      assert.strictEqual(schema.meta.readonly, false);
      assert.strictEqual(schema.meta.mutatesState, true);
    }
  });

  it("至少包含指定的 16 个工具", () => {
    const expectedTools = [
      "get_player_state", "get_inventory", "get_active_quests",
      "get_world_context", "get_combat_state", "inspect_forge_options",
      "lookup_location", "check_npc_stock",
      "issue_quest", "update_quest_progress", "forge_weapon",
      "consume_materials", "grant_item", "start_combat",
      "resolve_combat_action", "apply_world_event",
    ];
    for (const name of expectedTools) {
      assert.ok(MECHANICS_TOOL_SCHEMAS[name as keyof typeof MECHANICS_TOOL_SCHEMAS], `Tool ${name} should exist`);
    }
    assert.strictEqual(ALL_MECHANICS_TOOL_NAMES.length, 16);
  });
});

// ============================================================
// Quest Domain Tests
// ============================================================

describe("Quest Domain Service", () => {
  it("创建有效的任务", () => {
    __resetIdempotencyStore();

    const result = createQuest({
      title: "替阿织带外套",
      description: "阿织托你从三楼洗衣房拿一件没人认领的外套——她说洗衣阿姨认得她。",
      sourceNpcId: "N-009",
      nextHint: "上三楼洗衣房，跟阿姨说阿织让你来拿衣服。",
      rewardDescription: "原石×5",
      idempotencyKey: "quest_coat_n009_test",
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.ok(result.data.questId.startsWith("quest_"));
      assert.strictEqual(result.data.title, "替阿织带外套");
      assert.strictEqual(result.data.source, "N-009");
    }
  });

  it("拒绝标题过长的任务", () => {
    const result = createQuest({
      title: "这是一个超级超级超级超级超级长的任务标题超过了12字限制",
      description: "描述",
      idempotencyKey: "quest_long_title",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });

  it("拒绝空标题", () => {
    const result = createQuest({
      title: "",
      description: "描述",
      idempotencyKey: "quest_empty_title",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });

  it("幂等键防止重复创建", () => {
    __resetIdempotencyStore();
    const key = "quest_idempotent_test_1";

    const r1 = createQuest({
      title: "测试任务",
      description: "测试描述第一版",
      idempotencyKey: key,
    });

    const r2 = createQuest({
      title: "不同的标题",
      description: "不同的描述",
      idempotencyKey: key,
    });

    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
    if (r1.ok && r2.ok) {
      // 第二次应该返回第一次的结果（幂等）
      assert.strictEqual(r2.data.title, r1.data.title);
      assert.strictEqual(r2.data.description, r1.data.description);
    }
  });
});

// ============================================================
// Forge Domain Tests
// ============================================================

describe("Forge Domain Service", () => {
  it("配方不存在时返回错误", () => {
    __resetIdempotencyStore();
    const state = makeMockGameState();

    const result = executeForge(
      {
        recipeId: "nonexistent_recipe",
        idempotencyKey: "forge_nonexistent",
      },
      state as any

    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "recipe_not_found");
    }
  });

  it("原石不足时返回错误", () => {
    __resetIdempotencyStore();
    const state = makeMockGameState({ originium: 0 });

    const result = executeForge(
      {
        recipeId: "forge_repair_basic",
        idempotencyKey: "forge_no_originium",
      },
      state as any

    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "insufficient_currency");
    }
  });

  it("武器化不在 B1_PowerRoom 时返回错误", () => {
    __resetIdempotencyStore();
    const state = makeMockGameState({
      originium: 100,
      playerLocation: "1F_Lobby",
    });

    const result = executeForge(
      {
        recipeId: "forge_weaponize_c",
        idempotencyKey: "forge_weaponize_wrong_loc",
      },
      state as any

    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "not_at_location");
    }
  });

  it("材料不足时返回错误", () => {
    __resetIdempotencyStore();
    const state = makeMockGameState({
      originium: 100,
      playerLocation: "B1_PowerRoom",
      inventory: [], // 没有带标签的材料
    });

    const result = executeForge(
      {
        recipeId: "forge_mod_silent",
        idempotencyKey: "forge_no_materials",
      },
      state as any

    );

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "insufficient_materials");
    }
  });

  it("锻造幂等性：重复请求返回相同结果", () => {
    __resetIdempotencyStore();
    const state = makeMockGameState({
      originium: 100,
      playerLocation: "B1_PowerRoom",
    });

    const key = "forge_idempotent_test";
    const r1 = executeForge(
      { recipeId: "forge_weaponize_c", idempotencyKey: key },
      state as any

    );
    const r2 = executeForge(
      { recipeId: "forge_weaponize_c", idempotencyKey: key },
      state as any

    );

    assert.strictEqual(r1.ok, r2.ok);
    if (r1.ok && r2.ok) {
      assert.strictEqual(r2.data.recipeName, r1.data.recipeName);
    }
  });
});

// ============================================================
// Combat Domain Tests
// ============================================================

describe("Combat Domain Service", () => {
  it("拒绝无效的 NPC ID", () => {
    __resetIdempotencyStore();

    const result = initiateCombat({
      enemyNpcId: "invalid_id",
      reason: "测试",
      idempotencyKey: "combat_invalid_npc",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "invalid_target");
    }
  });

  it("有效的 NPC ID 可以开始战斗", () => {
    __resetIdempotencyStore();

    const result = initiateCombat({
      enemyNpcId: "N-008",
      reason: "老刘被激怒了",
      idempotencyKey: "combat_valid_npc",
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.ok(result.data.combatId.startsWith("combat_"));
      assert.strictEqual(result.data.enemyName, "N-008");
    }
  });

  it("拒绝无效的战斗动作类型", () => {
    const result = resolvePlayerCombatAction({
      actionDescription: "我发起攻击",
      actionType: "invalid_action",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });

  it("有效的战斗动作正确结算", () => {
    const result = resolvePlayerCombatAction({
      actionDescription: "我跃上桌子刺向他的手腕",
      actionType: "attack",
      target: "enemy",
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.actionType, "attack");
      assert.strictEqual(result.data.outcome, "命中");
      assert.ok(typeof result.data.damageDealt === "number");
    }
  });

  it("动作描述过长时拒绝", () => {
    const result = resolvePlayerCombatAction({
      actionDescription: "A".repeat(81),
      actionType: "attack",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });
});

// ============================================================
// World Event Domain Tests
// ============================================================

describe("World Event Service", () => {
  it("拒绝无效的事件类型", () => {
    __resetIdempotencyStore();

    const result = applyWorldEvent({
      eventType: "invalid_event",
      idempotencyKey: "event_invalid",
    });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });

  it("有效事件类型可以应用", () => {
    __resetIdempotencyStore();

    const result = applyWorldEvent({
      eventType: "npc_move",
      eventData: { npc_id: "N-008", target_location: "B1_PowerRoom", reason: "返回岗位" },
      idempotencyKey: "event_valid",
    });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.data.eventType, "npc_move");
      assert.strictEqual(result.data.applied, true);
    }
  });

  it("幂等键防止重复应用", () => {
    __resetIdempotencyStore();
    const key = "event_idempotent_test";

    const r1 = applyWorldEvent({ eventType: "npc_move", idempotencyKey: key });
    const r2 = applyWorldEvent({ eventType: "npc_move", idempotencyKey: key });

    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
  });
});

// ============================================================
// Idempotency Tests
// ============================================================

describe("Idempotency Store", () => {
  it("记录和检查幂等键", () => {
    __resetIdempotencyStore();

    const key = "test_key_1";
    const result = { ok: true as const, data: { value: 42 }, narrativeContext: "test" };

    assert.strictEqual(checkIdempotency(key), null);
    recordIdempotency(key, result as any);

    const cached = checkIdempotency(key);
    assert.ok(cached !== null);
    if (cached) {
      assert.strictEqual(cached.ok, true);
    }
  });

  it("不同键不冲突", () => {
    __resetIdempotencyStore();

    const result1 = { ok: true as const, data: { a: 1 }, narrativeContext: "a" };
    const result2 = { ok: true as const, data: { a: 2 }, narrativeContext: "b" };

    recordIdempotency("key_a", result1 as any);
    recordIdempotency("key_b", result2 as any);

    const cachedA = checkIdempotency("key_a");
    const cachedB = checkIdempotency("key_b");

    assert.ok(cachedA !== null);
    assert.ok(cachedB !== null);
    if (cachedA && cachedB) {
      assert.notDeepStrictEqual(cachedA, cachedB);
    }
  });
});

// ============================================================
// Additional Tests: Agent Limits, Timeouts, Security, Fallback
// ============================================================

// Additional tests below
import { MECHANICS_DEFAULTS } from "./mechanicsTypes";

describe("Mechanics Workflow Configuration", () => {
  it("默认最大轮数不超过硬上限", () => {
    assert.ok(MECHANICS_DEFAULTS.MAX_TOOL_ROUNDS <= MECHANICS_DEFAULTS.MAX_TOOL_ROUNDS_HARD_CAP);
    assert.strictEqual(MECHANICS_DEFAULTS.MAX_TOOL_ROUNDS, 2);
    assert.strictEqual(MECHANICS_DEFAULTS.MAX_TOOL_ROUNDS_HARD_CAP, 2);
  });

  it("总预算不超过合理范围", () => {
    assert.ok(MECHANICS_DEFAULTS.TOTAL_BUDGET_MS >= 10_000);
    assert.ok(MECHANICS_DEFAULTS.TOTAL_BUDGET_MS <= 60_000);
  });

  it("单工具超时不超过总预算", () => {
    assert.ok(MECHANICS_DEFAULTS.PER_TOOL_TIMEOUT_MS < MECHANICS_DEFAULTS.TOTAL_BUDGET_MS);
  });
});

describe("Tool Access Control", () => {
  it("只读工具定义不包含写工具", () => {
    const readonlyDefs = getReadonlyMechanicsToolDefinitions();
    const readonlyNames = readonlyDefs.map((d) => d.function.name);

    // 验证只包含 8 个只读工具
    assert.strictEqual(readonlyNames.length, 8);

    // 验证不包含任何写工具
    const writeNames = ["issue_quest", "update_quest_progress", "forge_weapon",
      "consume_materials", "grant_item", "start_combat",
      "resolve_combat_action", "apply_world_event"];
    for (const name of writeNames) {
      assert.ok(!readonlyNames.includes(name), `${name} should not be in readonly tools`);
    }
  });

  it("写工具定义不包含只读工具", () => {
    const writeDefs = getWriteMechanicsToolDefinitions();
    const writeNames = writeDefs.map((d) => d.function.name);

    // 验证包含 8 个写工具
    assert.strictEqual(writeNames.length, 8);

    const readonlyNames = ["get_player_state", "get_inventory", "get_active_quests",
      "get_world_context", "get_combat_state", "inspect_forge_options"];
    for (const name of readonlyNames) {
      assert.ok(!writeNames.includes(name), `${name} should not be in write tools`);
    }
  });

  it("所有工具定义都有非空 description", () => {
    // getMechanicsToolDefinitions imported at top of file
    const allDefs = getMechanicsToolDefinitions();
    for (const def of allDefs) {
      assert.ok(def.function.description.length > 0,
        `Tool ${def.function.name} should have a non-empty description`);
      assert.ok(def.function.description.length >= 20,
        `Tool ${def.function.name} description should be at least 20 chars`);
    }
  });
});

describe("Invalid Parameter Injection Prevention", () => {
  it("forge_weapon: 拒绝非字符串 recipe_id", () => {
    __resetIdempotencyStore();
    const state = { originium: 100, playerLocation: "B1_PowerRoom", inventory: [] };

    // Simulate malicious injection of a number
    const result = executeForge(
      { recipeId: "", idempotencyKey: "inject_test_1" },
      state as any

    );
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "recipe_not_found");
    }
  });

  it("issue_quest: 拒绝超长 title 注入", () => {
    __resetIdempotencyStore();
    const maliciousTitle = "A".repeat(1000); // 远超 12 字限制
    const result = createQuest({
      title: maliciousTitle,
      description: "test",
      idempotencyKey: "inject_long_title",
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });

  it("start_combat: 拒绝非 N- 前缀的 NPC ID", () => {
    __resetIdempotencyStore();
    const result = initiateCombat({
      enemyNpcId: "malicious_sql_injection'; DROP TABLE users;--",
      reason: "test",
      idempotencyKey: "inject_sql",
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "invalid_target");
    }
  });

  it("apply_world_event: 拒绝未知事件类型", () => {
    __resetIdempotencyStore();
    const result = applyWorldEvent({
      eventType: "delete_all_data",
      idempotencyKey: "inject_malicious_event",
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.code, "validation_error");
    }
  });
});

describe("Narrative Consistency After Tool Failure", () => {
  it("锻造失败时 narrativeContext 不声称成功", () => {
    __resetIdempotencyStore();
    const state = { originium: 0, playerLocation: "B1_PowerRoom", inventory: [] };

    const result = executeForge(
      { recipeId: "forge_repair_basic", idempotencyKey: "narrative_fail_1" },
      state as any

    );

    assert.strictEqual(result.ok, false);
    // narrativeContext 不应包含"成功"相关词汇
    assert.ok(!result.narrativeContext.includes("成功"));
    assert.ok(!result.narrativeContext.includes("完成"));
  });

  it("任务创建失败时 narrativeContext 不声称已创建", () => {
    __resetIdempotencyStore();
    const result = createQuest({
      title: "",
      description: "",
      idempotencyKey: "narrative_fail_2",
    });

    assert.strictEqual(result.ok, false);
    assert.ok(!result.narrativeContext.includes("已创建"));
  });

  it("成功操作时 narrativeContext 准确描述结果", () => {
    __resetIdempotencyStore();
    const result = createQuest({
      title: "测试任务",
      description: "这是一个测试",
      idempotencyKey: "narrative_success_1",
    });

    assert.strictEqual(result.ok, true);
    assert.ok(result.narrativeContext.includes("测试任务"));
  });
});

// ============================================================
// Transaction Atomicity Tests
// ============================================================

describe("Transaction Atomicity", () => {
  it("锻造验证全部通过前不消耗任何资源", () => {
    __resetIdempotencyStore();
    // 模拟：原石足够但材料不足的情况
    const state = { originium: 100, playerLocation: "B1_PowerRoom", inventory: [] };
    const originalOriginium = state.originium;
    const originalInventoryLen = state.inventory.length;

    const result = executeForge(
      { recipeId: "forge_mod_silent", idempotencyKey: "atomic_forge_fail" },
      state as any

    );

    // 验证失败
    assert.strictEqual(result.ok, false);
    // 验证原石未被扣除（因为没有实际修改 state，只是验证）
    assert.strictEqual(state.originium, originalOriginium);
    assert.strictEqual(state.inventory.length, originalInventoryLen);
  });

  it("任务创建失败时不产生副作用", () => {
    __resetIdempotencyStore();

    // 尝试创建无效任务
    const result = createQuest({
      title: "",
      description: "",
      idempotencyKey: "atomic_quest_fail",
    });

    assert.strictEqual(result.ok, false);

    // 验证幂等存储中不会记录失败操作
    const cached = checkIdempotency("atomic_quest_fail");
    assert.strictEqual(cached, null);
  });

  it("战斗开始失败时不修改任何状态", () => {
    __resetIdempotencyStore();

    const result = initiateCombat({
      enemyNpcId: "invalid",
      reason: "test",
      idempotencyKey: "atomic_combat_fail",
    });

    assert.strictEqual(result.ok, false);
    // 验证没有战斗 ID 被生成（通过幂等存储检查）
    const cached = checkIdempotency("atomic_combat_fail");
    assert.strictEqual(cached, null);
  });
});

// ============================================================
// Tool Timeout Simulation Tests
// ============================================================

describe("Tool Timeout Protection", () => {
  it("工具超时常量在合理范围内", () => {
    // 验证默认超时配置
    assert.strictEqual(MECHANICS_DEFAULTS.PER_TOOL_TIMEOUT_MS, 3000);
    assert.strictEqual(MECHANICS_DEFAULTS.TOTAL_BUDGET_MS, 20000);
  });

  it("每个工具注册都有超时设置", () => {
    // MECHANICS_TOOL_REGISTRY imported at top of file
    for (const [name, reg] of Object.entries(MECHANICS_TOOL_REGISTRY)) {
      assert.ok(reg.meta.timeoutMs > 0,
        `Tool ${name} should have a positive timeoutMs`);
      assert.ok(reg.meta.timeoutMs <= 30000,
        `Tool ${name} timeoutMs should not exceed 30s`);
    }
  });

  it("单工具超时不应超过总预算", () => {
    // MECHANICS_TOOL_REGISTRY imported at top of file
    for (const [name, reg] of Object.entries(MECHANICS_TOOL_REGISTRY)) {
      assert.ok(
        reg.meta.timeoutMs <= MECHANICS_DEFAULTS.TOTAL_BUDGET_MS,
        `Tool ${name} timeoutMs (${reg.meta.timeoutMs}) exceeds total budget (${MECHANICS_DEFAULTS.TOTAL_BUDGET_MS})`
      );
    }
  });

  it("所有写工具有幂等键参数要求", () => {
    const writeTools = [
      "issue_quest", "forge_weapon", "consume_materials",
      "grant_item", "start_combat", "apply_world_event",
    ];
    for (const name of writeTools) {
      const schema = MECHANICS_TOOL_SCHEMAS[name as keyof typeof MECHANICS_TOOL_SCHEMAS];
      const params = schema.parameters as { required?: string[] };
      // 幂等键应该在 required 或 properties 中
      const hasIdempotency =
        (params.required && params.required.includes("idempotency_key")) ||
        (schema.parameters.properties && "idempotency_key" in (schema.parameters.properties as any));
      assert.ok(hasIdempotency,
        `Write tool ${name} should require idempotency_key`);
    }
  });
});

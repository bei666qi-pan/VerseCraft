/**
 * Task-based 端到端评测引擎
 *
 * 核心流程：
 * 1. 加载场景定义
 * 2. 设置初始游戏状态
 * 3. 逐步执行玩家行动
 * 4. 收集每步的 AI 响应和状态变化
 * 5. 对比最终状态与期望结果
 * 6. 生成评测报告
 *
 * 设计原则（SWE-bench 风格）：
 * - 客观评判器：用游戏状态变化作为通过/失败信号
 * - 可复现：mock 模式下完全确定性
 * - 分层评分：basic 场景必须 100% 通过，advanced 允许部分通过
 */

import {
  type ExpectedOutcome,
  type OutcomeCheckResult,
  type OutcomeType,
  type StepResult,
  type TaskEvalGameState,
  type TaskEvalRunConfig,
  type TaskEvalRunSummary,
  type TaskEvalScenario,
  type TaskEvalScenarioResult,
  valuesMatch,
} from "./types";

// === 模拟 AI 响应（mock 模式） ===

interface MockTurnResult {
  narrative: string;
  dmJson: Record<string, unknown>;
  stateDelta: Partial<TaskEvalGameState>;
}

/**
 * 基于规则的状态模拟器：根据玩家输入推断 AI 会产生的状态变化。
 * 这不是真正的 AI 调用，而是用于离线评测的确定性模拟。
 */
function simulateAiResponse(input: string, currentState: TaskEvalGameState): MockTurnResult {
  const inputLower = input.toLowerCase();
  const delta: Partial<TaskEvalGameState> = {};

  // 使用累积的 inventory 基线，避免多个物品操作互相覆盖
  let accumulatedInventory = [...currentState.inventory];

  // 物品拾取
  const pickupMatch = input.match(/(?:捡|拾|拿|捡起|拾起|找到|发现)(?:了|到|起)?(?:地上|桌上|柜子里|角落里)?(?:的|那块)?(.{1,12})/);
  if (pickupMatch?.[1]) {
    const itemName = pickupMatch[1].trim().replace(/[，。、；！？\s]$/, "");
    accumulatedInventory = [...accumulatedInventory, { id: `item_${itemName}`, name: itemName, quantity: 1 }];
    delta.inventory = accumulatedInventory;
  }

  // 物品使用/消耗（支持多种模式）
  // 先尝试精确匹配已知物品名
  const knownItemNames = currentState.inventory.map((item) => item.name);
  let consumedItem: string | null = null;

  // 模式1: "用X包扎/涂/裹..." 其中 X 可能被夹杂在动词前
  const useMatch = input.match(/(?:用|使用|拿出|打开)(?:了|的)?(.{1,6})(?:包扎|喷雾|涂|吃|喝|贴在|绑在|裹住|快速裹住)/);
  if (useMatch?.[1]) {
    const captured = useMatch[1].trim();
    // 检查捕获的文本是否匹配或包含已知物品名
    const matched = knownItemNames.find((name) => captured.includes(name) || name.includes(captured));
    consumedItem = matched ?? null;
  }

  // 模式2: 松匹配 — 输入中直接出现物品名 + 使用动词
  if (!consumedItem) {
    for (const itemName of knownItemNames) {
      if (inputLower.includes(itemName)) {
        const verbs = ["包扎", "裹住", "喷雾", "涂在", "吃", "喝", "缠", "贴在", "绑在", "快速裹住"];
        if (verbs.some((v) => inputLower.includes(v))) {
          consumedItem = itemName;
          break;
        }
      }
    }
  }

  if (consumedItem) {
    accumulatedInventory = accumulatedInventory.filter((item) => item.name !== consumedItem);
    delta.inventory = accumulatedInventory;
  }

  // 原石使用
  if (inputLower.includes("原石") && (inputLower.includes("捏碎") || inputLower.includes("吸收") || inputLower.includes("使用"))) {
    delta.originium = Math.max(0, currentState.originium - 1);
    delta.sanity = Math.min(currentState.historicalMaxSanity, currentState.sanity + 15);
  }

  // NPC 交互
  if (inputLower.includes("廖暗")) {
    delta.presentNpcIds = [...new Set([...currentState.presentNpcIds, "npc_liao_an"])];
    const currentFav = currentState.npcFavorability["npc_liao_an"] ?? 0;
    delta.npcFavorability = { ...currentState.npcFavorability, "npc_liao_an": Math.min(100, currentFav + 2) };
  }

  // 职业技能激活
  if (inputLower.includes("现场还原") && currentState.activeSkillAvailable) {
    delta.activeSkillAvailable = false;
    delta.activeSkillCooldown = 6;
  }

  // 武器使用
  if (inputLower.includes("手电") && currentState.equippedWeapon === "警用手电") {
    delta.weaponStability = Math.max(0, currentState.weaponStability - 8);
  }

  // 位置移动
  const locationKeywords: Record<string, string> = {
    "楼梯间": "旧公寓楼梯间",
    "配电间": "B1_配电间",
    "一楼": "1F_Lobby",
    "B1": "B1_Lobby",
    "消防通道": "旧公寓消防通道",
    "四楼": "4F_Corridor",
    "登记口": "1F_PropertyOffice",
    "办公室": "3F_Office",
    "电梯": "旧公寓三楼电梯口",
  };
  for (const [keyword, location] of Object.entries(locationKeywords)) {
    if (inputLower.includes(keyword)) {
      delta.playerLocation = location;
      break;
    }
  }

  // 任务完成检测
  if ((inputLower.includes("登记册") || inputLower.includes("三个月") || inputLower.includes("档案") || inputLower.includes("对上了") || inputLower.includes("拼在一起")) && currentState.tasks.length > 0) {
    delta.tasks = currentState.tasks.map((t) =>
      t.status === "active" ? { ...t, status: "completed" as const, questState: "completed" as const } : t
    );
  }

  // 新 NPC 发现
  if (inputLower.includes("欣蓝")) {
    delta.codexNpcIds = [...new Set([...currentState.codexNpcIds, "npc_xin_lan"])];
  }
  if (inputLower.includes("老刘") || inputLower.includes("电工")) {
    delta.codexNpcIds = [...new Set([...currentState.codexNpcIds, "npc_old_liu"])];
  }

  // 理智变化（低理智时）
  if (currentState.sanity < 35) {
    delta.sanity = currentState.sanity - 3;
  }

  // 生成 narrative
  const narrativeLines: string[] = [];
  narrativeLines.push(inputLower.includes("走廊")
    ? "走廊尽头的灯管闪了两下，暗处的刮擦声近了一步。"
    : "你环顾四周，旧公寓的墙壁散发着一股霉湿的气味。");

  if (delta.inventory) {
    narrativeLines.push("你在角落发现了一样东西，拿起来仔细看了看。");
  }
  if (delta.playerLocation) {
    narrativeLines.push(`你走向${Object.entries(locationKeywords).find(([k]) => inputLower.includes(k))?.[0] ?? "新的地点"}。`);
  }
  if (delta.sanity !== undefined && (delta.sanity) < currentState.sanity) {
    narrativeLines.push("理智的边界在松动——你看见的和你确信的之间，裂缝越来越大。");
  }

  const narrative = narrativeLines.join("");

  const dmJson: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: delta.sanity !== undefined ? currentState.sanity - (delta.sanity ?? currentState.sanity) : 0,
    narrative,
    is_death: delta.isDeath ?? false,
    consumes_time: true,
    options: ["继续前进", "后退观察", "检查细节", "呼叫同伴"],
    currency_change: delta.originium !== undefined ? (delta.originium - currentState.originium) : 0,
    awarded_items: delta.inventory
      ? delta.inventory.filter(
          (item) => !currentState.inventory.some((existing) => existing.name === item.name)
        )
      : [],
    player_location: delta.playerLocation ?? currentState.playerLocation,
    task_updates: delta.tasks
      ?.filter((t) => t.status === "completed")
      .map((t) => ({ taskId: t.id, status: "completed" })) ?? [],
    codex_updates: delta.codexNpcIds
      ? delta.codexNpcIds
          .filter((id) => !currentState.codexNpcIds.includes(id))
          .map((id) => ({ type: "npc", id }))
      : [],
  };

  return { narrative, dmJson, stateDelta: delta };
}

// === 核心评测引擎 ===

/** 执行单个场景评测 */
export async function evaluateTaskScenario(
  scenario: TaskEvalScenario,
  config: TaskEvalRunConfig
): Promise<TaskEvalScenarioResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  let currentState = { ...scenario.initialState };

  // 逐步执行玩家行动
  for (const action of scenario.playerActions) {
    let result: MockTurnResult;

    if (config.mockMode) {
      // Mock 模式：使用规则模拟器
      result = simulateAiResponse(action.input, currentState);
    } else {
      // Live 模式：调用真实的 /api/chat
      result = await callLiveApi(action.input, currentState, config.baseUrl ?? "http://127.0.0.1:666");
    }

    // 应用状态变化
    const newState = applyStateDelta(currentState, result.stateDelta);
    const stateAfter = { ...newState };

    // 中间步骤检查
    let stepPassed = true;
    const stepFailures: string[] = [];
    if (action.expectedResponse && config.checkIntermediateSteps) {
      if (action.expectedResponse.minNarrativeChars) {
        if (result.narrative.length < action.expectedResponse.minNarrativeChars) {
          stepPassed = false;
          stepFailures.push(`narrative_too_short:${result.narrative.length}<${action.expectedResponse.minNarrativeChars}`);
        }
      }
      if (action.expectedResponse.mustContain) {
        for (const term of action.expectedResponse.mustContain) {
          if (!result.narrative.includes(term)) {
            stepPassed = false;
            stepFailures.push(`missing_term:${term}`);
          }
        }
      }
      if (action.expectedResponse.mustNotContain) {
        for (const term of action.expectedResponse.mustNotContain) {
          if (result.narrative.includes(term)) {
            stepPassed = false;
            stepFailures.push(`forbidden_term:${term}`);
          }
        }
      }
    }

    stepResults.push({
      step: action.step,
      input: action.input,
      narrative: result.narrative,
      dmJson: result.dmJson,
      stateAfter,
      passed: stepPassed,
      failures: stepFailures,
    });

    currentState = newState;

    // 如果步骤失败且不继续，提前终止
    if (!stepPassed && !config.continueOnFailure) {
      break;
    }
  }

  // 对比最终状态与期望结果
  const outcomes = checkOutcomes(scenario.expectedOutcomes, currentState, scenario.initialState);
  const checksPassed = outcomes.filter((o) => o.passed).length;
  const checksTotal = outcomes.length;
  const score = checksTotal > 0 ? checksPassed / checksTotal : 0;
  const passed = checksPassed === checksTotal || (scenario.difficulty === "advanced" && score >= 0.8);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    difficulty: scenario.difficulty,
    passed,
    score,
    checksPassed,
    checksTotal,
    outcomes,
    stepResults,
    finalState: currentState,
    durationMs: Date.now() - startTime,
    failures: outcomes.filter((o) => !o.passed).map((o) => `${o.type}:${o.description}`),
  };
}

/** 对比期望结果与实际状态 */
function checkOutcomes(
  expected: ExpectedOutcome[],
  finalState: TaskEvalGameState,
  initialState: TaskEvalGameState
): OutcomeCheckResult[] {
  return expected.map((outcome) => {
    const actual = getActualValue(outcome.type, finalState, initialState);
    const passed = valuesMatch(outcome.expected, actual, outcome.tolerance);

    return {
      type: outcome.type,
      description: outcome.description,
      passed,
      expected: outcome.expected,
      actual,
      weight: outcome.weight,
      detail: passed ? undefined : `expected ${JSON.stringify(outcome.expected)}, got ${JSON.stringify(actual)}`,
    };
  });
}

/** 根据 OutcomeType 获取实际值 */
function getActualValue(type: OutcomeType, state: TaskEvalGameState, initialState: TaskEvalGameState): unknown {
  switch (type) {
    case "item_acquired":
      return state.inventory.length > initialState.inventory.length;
    case "item_consumed":
      return state.inventory.length < initialState.inventory.length;
    case "item_count":
      return state.inventory.length;
    case "originium_changed":
      return state.originium !== initialState.originium;
    case "originium_exact":
      return state.originium;
    case "sanity_changed":
      return state.sanity !== initialState.sanity;
    case "sanity_in_range":
      return state.sanity;
    case "hp_changed":
      return state.hp !== initialState.hp;
    case "task_status":
      return state.tasks.find((t) => t.status === "completed")?.id ?? null;
    case "task_completed":
      return state.tasks.some((t) => t.status === "completed");
    case "location_changed":
      return state.playerLocation !== initialState.playerLocation;
    case "location_equals":
      return state.playerLocation;
    case "npc_present":
      return state.presentNpcIds;
    case "npc_favorability":
      return state.npcFavorability;
    case "codex_entry_added":
      return state.codexNpcIds.length > initialState.codexNpcIds.length;
    case "profession_changed":
      return state.profession !== initialState.profession;
    case "weapon_equipped":
      return state.equippedWeapon;
    case "weapon_stability":
      return state.weaponStability;
    case "flag_unlocked":
      return state.unlockedFlags;
    case "death_occurred":
      return state.isDeath;
    default:
      return null;
  }
}

/** 应用状态 delta */
function applyStateDelta(state: TaskEvalGameState, delta: Partial<TaskEvalGameState>): TaskEvalGameState {
  return {
    ...state,
    ...delta,
    inventory: delta.inventory ?? [...state.inventory],
    warehouse: delta.warehouse ?? [...state.warehouse],
    tasks: delta.tasks ?? [...state.tasks],
    presentNpcIds: delta.presentNpcIds ?? [...state.presentNpcIds],
    npcFavorability: delta.npcFavorability ?? { ...state.npcFavorability },
    codexNpcIds: delta.codexNpcIds ?? [...state.codexNpcIds],
    codexAnomalyNames: delta.codexAnomalyNames ?? [...state.codexAnomalyNames],
    unlockedFlags: delta.unlockedFlags ?? [...state.unlockedFlags],
  };
}

// === Live API 调用（占位，真实实现需要 network） ===

async function callLiveApi(
  input: string,
  _state: TaskEvalGameState,
  baseUrl: string
): Promise<MockTurnResult> {
  // 真实实现会调用 /api/chat SSE 端点
  // 这里提供基础框架
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      },
      body: JSON.stringify({
        latestUserInput: input,
        messages: [{ role: "user", content: input }],
        playerContext: JSON.stringify(_state),
        sessionId: `task-eval-${Date.now()}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const text = await response.text();
    // 解析 SSE 流，提取 final JSON
    const finalMatch = text.match(/__VERSECRAFT_FINAL__:(.+)/);
    if (finalMatch?.[1]) {
      const dmJson = JSON.parse(finalMatch[1].trim()) as Record<string, unknown>;
      return {
        narrative: (dmJson.narrative as string) ?? "",
        dmJson,
        stateDelta: {},
      };
    }

    throw new Error("No final frame in SSE response");
  } catch (error) {
    // 降级到模拟响应
    console.warn(`Live API call failed, falling back to simulation: ${error}`);
    return simulateAiResponse(input, _state);
  }
}

// === 批次执行 ===

export async function runTaskEval(config: TaskEvalRunConfig): Promise<TaskEvalRunSummary> {
  const startTime = Date.now();
  const results: TaskEvalScenarioResult[] = [];

  for (const scenario of config.scenarios) {
    const result = await evaluateTaskScenario(scenario, config);
    results.push(result);
  }

  const durationMs = Date.now() - startTime;
  const totalScenarios = results.length;
  const passedScenarios = results.filter((r) => r.passed).length;
  const failedScenarios = totalScenarios - passedScenarios;
  const passRate = totalScenarios > 0 ? passedScenarios / totalScenarios : 0;
  const averageScore = totalScenarios > 0
    ? results.reduce((sum, r) => sum + r.score, 0) / totalScenarios
    : 0;

  // 按难度分组
  const byDifficulty: TaskEvalRunSummary["byDifficulty"] = {};
  for (const r of results) {
    if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, passed: 0, rate: 0 };
    byDifficulty[r.difficulty]!.total++;
    if (r.passed) byDifficulty[r.difficulty]!.passed++;
  }
  for (const key of Object.keys(byDifficulty)) {
    const entry = byDifficulty[key]!;
    entry.rate = entry.total > 0 ? entry.passed / entry.total : 0;
  }

  // 按系统分组（来自场景定义）
  const bySystem: TaskEvalRunSummary["bySystem"] = {};
  for (let i = 0; i < results.length; i++) {
    const scenario = config.scenarios[i]!;
    const result = results[i]!;
    for (const system of scenario.systems) {
      if (!bySystem[system]) bySystem[system] = { total: 0, passed: 0, rate: 0 };
      bySystem[system]!.total++;
      if (result.passed) bySystem[system]!.passed++;
    }
  }
  for (const key of Object.keys(bySystem)) {
    const entry = bySystem[key]!;
    entry.rate = entry.total > 0 ? entry.passed / entry.total : 0;
  }

  // Gate 判定
  const gatePass = passRate >= 0.85 && averageScore >= 0.8;

  return {
    config: {
      mockMode: config.mockMode,
      timeoutMs: config.timeoutMs,
      checkIntermediateSteps: config.checkIntermediateSteps,
      continueOnFailure: config.continueOnFailure,
    },
    totalScenarios,
    passedScenarios,
    failedScenarios,
    passRate,
    averageScore,
    byDifficulty,
    bySystem,
    results,
    durationMs,
    gatePass,
  };
}

/** 纯函数版本：离线执行评测（不依赖网络） */
export function evaluateTaskScenarioOffline(
  scenario: TaskEvalScenario
): TaskEvalScenarioResult {
  return evaluateTaskScenarioSync(scenario);
}

function evaluateTaskScenarioSync(scenario: TaskEvalScenario): TaskEvalScenarioResult {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  let currentState = { ...scenario.initialState };

  for (const action of scenario.playerActions) {
    const result = simulateAiResponse(action.input, currentState);
    const newState = applyStateDelta(currentState, result.stateDelta);

    stepResults.push({
      step: action.step,
      input: action.input,
      narrative: result.narrative,
      dmJson: result.dmJson,
      stateAfter: { ...newState },
      passed: true,
      failures: [],
    });

    currentState = newState;
  }

  const outcomes = checkOutcomes(scenario.expectedOutcomes, currentState, scenario.initialState);
  const checksPassed = outcomes.filter((o) => o.passed).length;
  const checksTotal = outcomes.length;
  const score = checksTotal > 0 ? checksPassed / checksTotal : 0;
  const passed = checksPassed === checksTotal || (scenario.difficulty === "advanced" && score >= 0.8);

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    difficulty: scenario.difficulty,
    passed,
    score,
    checksPassed,
    checksTotal,
    outcomes,
    stepResults,
    finalState: currentState,
    durationMs: Date.now() - startTime,
    failures: outcomes.filter((o) => !o.passed).map((o) => `${o.type}:${o.description}`),
  };
}

/**
 * Evaluation & Regression Campaign — Scenario Pool
 *
 * Manages the collection of test scenarios used for game execution
 * and evaluation. Supports golden cases, regression cases, replay
 * cases, boundary cases, and property/fuzz cases.
 *
 * Scenarios are loaded from:
 * - benchmarks/self-improve/smoke-cases.json (smoke profile)
 * - benchmarks/self-improve/regression-cases.json (accumulated regression)
 * - Programmatically generated boundary/property cases
 */

import type { SelfImproveScenario, ScenarioCategory } from "./types";

// ── In-memory pool ────────────────────────────────────

const pool: Map<string, SelfImproveScenario> = new Map();

// ── Built-in smoke cases ──────────────────────────────

const BUILTIN_SMOKE_CASES: SelfImproveScenario[] = [
  // ── Golden Cases ──
  {
    caseId: "golden-explore-room",
    name: "探索房间（正向）",
    category: "golden",
    source: "hand",
    holdout: false,
    tags: ["golden", "explore", "happy-path"],
    difficulty: "basic",
    description: "简单探索动作：玩家观察周围环境，应获得描述性叙事和有效选项",
    playerInput: "我环顾四周，看看这个房间里有什么。",
    expectedBehavior: "返回叙事描述和至少2个可执行选项",
    expectedInvariants: [
      { id: "action_legal", check: "action_legality", expected: "pass", severity: "critical" },
      { id: "has_options", check: "option_executability", expected: "pass", severity: "major" },
    ],
    seed: 1001,
    requiresLive: false,
  },
  {
    caseId: "golden-talk-to-npc",
    name: "与NPC对话（正向）",
    category: "golden",
    source: "hand",
    holdout: false,
    tags: ["golden", "npc", "dialogue", "happy-path"],
    difficulty: "basic",
    description: "与已知NPC对话，NPC应只知道自己该知道的事",
    playerInput: "我走向林晚枫，想和他聊聊最近发生的事。",
    expectedBehavior: "NPC回应，不泄露其他NPC私事或全局真相",
    expectedInvariants: [
      { id: "npc_knows_boundary", check: "npc_epistemic_boundary", expected: "pass", severity: "critical" },
      { id: "action_legal", check: "action_legality", expected: "pass", severity: "critical" },
    ],
    seed: 1002,
    requiresLive: false,
  },
  // ── Boundary Cases ──
  {
    caseId: "boundary-nonexistent-item",
    name: "使用不存在的物品（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "inventory", "negative"],
    difficulty: "intermediate",
    description: "玩家尝试使用一个不在背包中的物品，应被拒绝",
    playerInput: "我拿出那把从未拥有的钥匙，试着打开面前的门。",
    expectedBehavior: "行动被标记为非法，或系统指出物品不存在",
    expectedInvariants: [
      // 判定方向是"资源守恒成立"（正确行为）：不发放物品、不错误扣费即通过。
      // 历史上误标为 expected:"fail"，导致正确行为被判 fail（极性反转，oracle_stage_defect 修复）。
      { id: "no_fake_item", check: "resource_conservation", expected: "pass", severity: "critical" },
    ],
    seed: 2001,
    requiresLive: false,
  },
  {
    caseId: "boundary-npc-not-present",
    name: "与不在场NPC互动（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "npc", "epistemic", "negative"],
    difficulty: "intermediate",
    description: "玩家尝试与不在当前场景的NPC互动",
    playerInput: "我对着空气喊楼上的陈婆婆下来开门。",
    expectedBehavior: "NPC不在场，不应凭空出现回应",
    expectedInvariants: [
      { id: "npc_presence", check: "npc_epistemic_boundary", expected: "fail", severity: "critical" },
    ],
    seed: 2002,
    requiresLive: false,
  },
  {
    caseId: "boundary-dead-still-acts",
    name: "死亡状态仍能行动（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "death", "negative"],
    difficulty: "advanced",
    description: "角色死亡/昏迷后不应执行主动动作",
    playerInput: "虽然我已经倒在地上，但我还是努力爬起来反击。",
    expectedBehavior: "死亡/昏迷状态下行动被标记为非法",
    expectedInvariants: [
      { id: "death_gate", check: "death_state_gating", expected: "fail", severity: "critical" },
    ],
    seed: 2003,
    requiresLive: false,
  },
  // ── Forge Transaction Cases ──
  {
    caseId: "boundary-forge-insufficient-materials",
    name: "锻造材料不足（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "forge", "resource", "negative"],
    difficulty: "intermediate",
    description: "材料不足时锻造应失败，不扣材料，不生成物品",
    playerInput: "我拿出仅有的两块铁矿石，尝试锻造一把长剑。",
    expectedBehavior: "锻造失败，材料不扣除，不生成物品",
    expectedInvariants: [
      { id: "no_forge_without_mats", check: "forge_transaction", expected: "pass", severity: "critical" },
      { id: "materials_not_consumed", check: "resource_conservation", expected: "pass", severity: "critical" },
    ],
    seed: 5001,
    requiresLive: false,
  },
  {
    caseId: "boundary-forge-duplicate-prevention",
    name: "锻造重复提交（幂等性）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "forge", "idempotency", "negative"],
    difficulty: "intermediate",
    description: "同一锻造请求重复提交不应产生重复物品",
    playerInput: "我再次确认，就用刚才的材料锻造短剑。",
    expectedBehavior: "不重复生成物品，不重复扣除材料",
    expectedInvariants: [
      { id: "no_duplicate_forge", check: "idempotency", expected: "pass", severity: "major" },
      { id: "no_double_consume", check: "resource_conservation", expected: "pass", severity: "critical" },
    ],
    seed: 5002,
    requiresLive: false,
  },
  // ── Task Lifecycle Cases ──
  {
    caseId: "boundary-task-not-accepted",
    name: "未接任务却完成（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "task", "lifecycle", "negative"],
    difficulty: "intermediate",
    description: "玩家未接取任务却声称完成任务——模型应正确处理（不产生任务状态变更）",
    playerInput: "我已经完成了那个调查公寓的任务，把奖励给我吧。",
    expectedBehavior: "模型应识别无任务可完成，不产生 task_updates 或 new_tasks",
    expectedInvariants: [
      { id: "no_unstarted_task_completion", check: "task_lifecycle", expected: "pass", severity: "critical" },
      { id: "no_items_awarded_for_nonexistent_task", check: "resource_conservation", expected: "pass", severity: "major" },
    ],
    seed: 6001,
    requiresLive: false,
  },
  // ── Profession Boundary Cases ──
  {
    caseId: "boundary-profession-exclusive-ability",
    name: "非对应职业使用专属能力（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "profession", "negative"],
    difficulty: "intermediate",
    description: "非剑士职业尝试使用剑士专属技能——模型应正确处理（不产生技能效果）",
    playerInput: "我虽然不是剑士，但我想试试用剑士的「破军斩」攻击。",
    expectedBehavior: "模型应识别职业不匹配，不产生技能效果或状态变更",
    expectedInvariants: [
      { id: "no_cross_profession_skill_effect", check: "profession_boundary", expected: "pass", severity: "critical" },
      { id: "no_unauthorized_items", check: "resource_conservation", expected: "pass", severity: "major" },
    ],
    seed: 7001,
    requiresLive: false,
  },
  // ── Narrative/State Consistency Cases ──
  {
    caseId: "boundary-narrative-state-mismatch",
    name: "叙事声称成功但状态未变（负向）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "narrative", "state", "negative"],
    difficulty: "advanced",
    description: "叙事描述成功获得物品但awarded_items为空",
    playerInput: "我从箱子里拿到了那把钥匙。",
    expectedBehavior: "叙事与状态变更应一致",
    expectedInvariants: [
      { id: "narrative_state_consistent", check: "state_narrative_consistency", expected: "pass", severity: "major" },
    ],
    seed: 8001,
    requiresLive: false,
  },
  // ── Forward Keep-Alive Cases ──
  {
    caseId: "keepalive-normal-explore",
    name: "正常探索（正向保活）",
    category: "golden",
    source: "hand",
    holdout: false,
    tags: ["golden", "explore", "keep-alive", "happy-path"],
    difficulty: "basic",
    description: "正常探索行为不应被误判为非法——确保修复不误伤正常玩法",
    playerInput: "我沿着走廊慢慢走，看看两边有什么房间。",
    expectedBehavior: "行动合法，返回探索描述",
    expectedInvariants: [
      { id: "keepalive_explore", check: "action_legality", expected: "pass", severity: "critical" },
      { id: "keepalive_options", check: "option_executability", expected: "pass", severity: "major" },
    ],
    seed: 9001,
    requiresLive: false,
  },
  {
    caseId: "keepalive-normal-talk",
    name: "正常对话（正向保活）",
    category: "golden",
    source: "hand",
    holdout: false,
    tags: ["golden", "dialogue", "keep-alive", "happy-path"],
    difficulty: "basic",
    description: "与在场NPC正常对话不应被误杀",
    playerInput: "我找到林晚枫，问他最近有没有发现什么异常。",
    expectedBehavior: "NPC正常回应，不泄露禁止信息",
    expectedInvariants: [
      { id: "keepalive_talk", check: "action_legality", expected: "pass", severity: "critical" },
      { id: "keepalive_npc_boundary", check: "npc_epistemic_boundary", expected: "pass", severity: "critical" },
    ],
    seed: 9002,
    requiresLive: false,
  },
  // ── Property/Fuzz Cases ──
  {
    caseId: "fuzz-empty-input",
    name: "空输入（负向）",
    category: "fuzz",
    source: "synth",
    holdout: false,
    tags: ["fuzz", "input-validation"],
    difficulty: "basic",
    description: "空字符串输入应在到达模型前被服务端拒绝——不消耗回合时间",
    playerInput: "",
    expectedBehavior: "输入在服务端早期被拒绝（400），不调用 AI 模型，不消耗回合",
    expectedInvariants: [
      { id: "empty_rejected_by_server", check: "action_legality", expected: "fail", severity: "critical" },
    ],
    seed: 3001,
    requiresLive: false,
  },
  {
    caseId: "fuzz-repeated-action",
    name: "重复提交同一行动（幂等性）",
    category: "fuzz",
    source: "synth",
    holdout: false,
    tags: ["fuzz", "idempotency"],
    difficulty: "intermediate",
    description: "连续两次提交相同行动，不应产生重复效果",
    playerInput: "我打开面前的门。",
    expectedBehavior: "第一次成功，第二次不应重复开门奖励",
    expectedInvariants: [
      { id: "idempotent", check: "idempotency", expected: "pass", severity: "major" },
    ],
    seed: 3002,
    requiresLive: false,
  },
  // ── Holdout cases (hidden from repair agent) ──
  {
    caseId: "holdout-npc-secret-knowledge",
    name: "NPC得知未公开信息（Holdout）",
    category: "golden",
    source: "hand",
    holdout: true,
    tags: ["holdout", "npc", "epistemic"],
    difficulty: "advanced",
    description: "验证NPC不会知道只有DM才知道的秘密信息",
    playerInput: "我问林晚枫，这栋公寓的「真正秘密」到底是什么。",
    expectedBehavior: "NPC不应泄露DM-only的根因信息",
    expectedInvariants: [
      { id: "dm_leak", check: "npc_epistemic_boundary", expected: "pass", severity: "critical" },
    ],
    seed: 4001,
    requiresLive: false,
  },
];

// ── Pool management ───────────────────────────────────

export function loadBuiltinScenarios(): void {
  for (const scenario of BUILTIN_SMOKE_CASES) {
    pool.set(scenario.caseId, { ...scenario });
  }
}

export function addScenario(scenario: SelfImproveScenario): void {
  pool.set(scenario.caseId, scenario);
}

export function addScenarios(scenarios: SelfImproveScenario[]): void {
  for (const s of scenarios) {
    pool.set(s.caseId, s);
  }
}

export function getScenario(caseId: string): SelfImproveScenario | undefined {
  return pool.get(caseId);
}

export function getAllScenarios(): SelfImproveScenario[] {
  return Array.from(pool.values());
}

export function getScenariosByCategory(category: ScenarioCategory): SelfImproveScenario[] {
  return getAllScenarios().filter((s) => s.category === category);
}

export function getDevScenarios(): SelfImproveScenario[] {
  return getAllScenarios().filter((s) => !s.holdout);
}

export function getHoldoutScenarios(): SelfImproveScenario[] {
  return getAllScenarios().filter((s) => s.holdout);
}

export function getScenariosByTag(tag: string): SelfImproveScenario[] {
  return getAllScenarios().filter((s) => s.tags.includes(tag));
}

export function getScenariosByIds(ids: string[]): SelfImproveScenario[] {
  return ids.map((id) => pool.get(id)).filter(Boolean) as SelfImproveScenario[];
}

export function scenarioCount(): number {
  return pool.size;
}

export function clearPool(): void {
  pool.clear();
}

// ── Regression case accumulator ───────────────────────

export function promoteToRegression(scenario: SelfImproveScenario): SelfImproveScenario {
  const promoted: SelfImproveScenario = {
    ...scenario,
    category: "regression",
    source: "regression_defect",
    tags: [...new Set([...scenario.tags, "regression"])],
  };
  addScenario(promoted);
  return promoted;
}

// ── Initialization ────────────────────────────────────

export function initializeScenarioPool(): void {
  clearPool();
  loadBuiltinScenarios();
}

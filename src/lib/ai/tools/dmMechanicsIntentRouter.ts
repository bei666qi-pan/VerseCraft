// src/lib/ai/tools/dmMechanicsIntentRouter.ts
/**
 * DM Agent Mechanics Intent Router
 *
 * 纯函数分类器：判断玩家输入是否包含明确的 mechanics intent，
 * 从而决定是否应进入 DM Agent 工具调用路径。
 *
 * 规则：
 * - mechanics 意图（任务/锻造/战斗/物品操作）→ 允许进入 Agent
 * - narrative 意图（观察/对话/闲聊/探索）→ 禁止进入 Agent，走旧 DM 路径
 * - ambiguous 意图（模糊/混合）→ 保守走旧路径，不应擅自写状态
 *
 * 设计约束：
 * - 纯函数，不做 IO，不调用 LLM
 * - 确定性分类，不依赖外部状态
 * - 关键词匹配为主，保守优先
 */

// ============================================================
// Types
// ============================================================

/** 意图分类结果 */
export type MechanicsIntentClassification =
  | "mechanics"   // 明确 mechanics → 允许 Agent
  | "narrative"   // 明确叙事 → 禁止 Agent
  | "ambiguous";  // 模糊 → 保守走旧路径

/** 分类详情 */
export interface MechanicsIntentResult {
  classification: MechanicsIntentClassification;
  /** 匹配到的 mechanics 信号关键词 */
  matchedSignals: string[];
  /** 匹配到的 narrative 信号关键词 */
  matchedNarrative: string[];
  /** 人类可读的决策理由 */
  reason: string;
}

// ============================================================
// Signal Dictionaries
// ============================================================

/** 强 mechanics 信号：包含这些词 → 高概率是 mechanics 意图 */
const STRONG_MECHANICS_SIGNALS: readonly string[] = [
  // 锻造相关
  "锻造", "打造武器", "打造装备", "制作武器", "制作装备",
  "修理武器", "修复武器", "修理装备", "改装武器", "改装装备",
  "强化武器", "强化装备", "锻剑", "铸剑",
  // 任务相关（注意：必须连续子串匹配）
  "接任务", "领任务", "做任务", "完成任务", "提交任务", "交任务",
  "接受委托", "领取委托",
  // 战斗相关
  "攻击", "开战", "应战", "迎战", "格挡攻击", "闪避攻击",
  "迎击", "反击敌人", "出击攻击", "冲锋攻击",
  // 物品/材料操作
  "消耗材料", "使用物品", "装备武器", "卸下武器",
  "合成材料", "分解装备",
  // 原石/货币
  "花费原石", "消耗原石", "支付原石",
];

/** 弱 mechanics 信号：包含这些词 → 可能是 mechanics，需要更多上下文判断 */
const WEAK_MECHANICS_SIGNALS: readonly string[] = [
  "锻造台", "打铁", "淬火",
  "委托", "请求任务",
  "检查背包", "查看装备", "查看武器", "看背包", "看装备",
  "锻造选项", "可用配方", "查看配方",
  "装备", "武器",
];

/** 强 narrative 信号：包含这些词 → 几乎肯定是叙事/对话 */
const STRONG_NARRATIVE_SIGNALS: readonly string[] = [
  // 观察/探索
  "观察", "查看周围", "环顾", "打量", "眺望", "看看周围",
  "探索", "搜索", "搜寻", "找找看",
  "检查", "查看", "看一看", "看一下",
  // 对话
  "说话", "交谈", "聊天", "询问", "问一下", "打招呼",
  "你好", "嗨", "嘿", "请问",
  // 移动
  "前往", "走到", "走去", "上楼", "下楼", "离开",
  "去.*楼", "回到", "返回",
  // 纯叙事
  "思考", "回忆", "想起", "感觉", "觉得",
  "等待", "等待",
  // 闲聊/情感
  "怎么", "为什么", "什么", "告诉我", "讲讲",
];

/** 反信号：即使有 mechanics 关键词，但上下文中包含这些词 → 降级为 ambiguous */
const ANTI_MECHANICS_SIGNALS: readonly string[] = [
  // 通用询问/否定模式（在任何 combo check 之前触发）
  // 这些模式表示"咨询/了解"而非"执行"
  "什么是", "是什么", "是不是",
  "能不能", "可不可以",
  "怎么", "如何",
  "不想", "不要", "不是要",
  "问一下", "咨询", "打听",
  // 疑问句检测：任何以"吗"结尾的输入都是询问，不是执行
  "吗",
];

// ============================================================
// Router
// ============================================================

/**
 * 分类玩家输入的 mechanics 意图
 *
 * 算法：
 * 1. 检查强 narrative 信号 → 直接分类为 narrative
 * 2. 检查反 mechanics 信号 → 降级为 ambiguous（问题/咨询而非执行）
 * 3. 检查强 mechanics 信号 → 分类为 mechanics
 * 4. 检查弱 mechanics 信号 → 分类为 ambiguous
 * 5. 默认 → narrative
 *
 * @param userInput 玩家原始输入文本
 * @param normalizedIntent 可选的规范化意图（来自 turnEngine）
 */
export function classifyMechanicsIntent(
  userInput: string,
  __normalizedIntent?: { primaryVerb?: string; primaryTarget?: string } | null
): MechanicsIntentResult {
  const input = userInput.trim();
  const lowerInput = input.toLowerCase();

  const matchedSignals: string[] = [];
  const matchedNarrative: string[] = [];

  // Step 1: 强 narrative 信号 → 直接 narrative
  for (const signal of STRONG_NARRATIVE_SIGNALS) {
    if (lowerInput.includes(signal)) {
      matchedNarrative.push(signal);
    }
  }
  if (matchedNarrative.length >= 2) {
    return {
      classification: "narrative",
      matchedSignals: [],
      matchedNarrative,
      reason: `检测到强叙事信号: ${matchedNarrative.join(", ")}`,
    };
  }

  // Step 2: 反 mechanics 信号 → ambiguous
  for (const anti of ANTI_MECHANICS_SIGNALS) {
    if (lowerInput.includes(anti)) {
      return {
        classification: "ambiguous",
        matchedSignals: [],
        matchedNarrative: [anti],
        reason: `检测到反 mechanics 信号: "${anti}"（可能是咨询而非执行）`,
      };
    }
  }

  // Step 2b: 疑问句检测 — 以"吗"或"？"结尾
  // 但如果有叙事信号匹配，说明是角色对话（如"请问你是谁？"），不应降级
  if (matchedNarrative.length === 0 && (input.endsWith("吗") || input.endsWith("？") || input.endsWith("?"))) {
    return {
      classification: "ambiguous",
      matchedSignals: [],
      matchedNarrative: ["疑问句"],
      reason: "检测到疑问句（咨询而非执行）",
    };
  }

  // Step 3: 强 mechanics 信号 → mechanics
  for (const signal of STRONG_MECHANICS_SIGNALS) {
    if (lowerInput.includes(signal)) {
      matchedSignals.push(signal);
    }
  }
  if (matchedSignals.length >= 1) {
    // 如果有 narrative 信号同时存在 → ambiguous
    if (matchedNarrative.length > 0) {
      return {
        classification: "ambiguous",
        matchedSignals,
        matchedNarrative,
        reason: `同时检测到 mechanics 信号 (${matchedSignals.join(", ")}) 和叙事信号 (${matchedNarrative.join(", ")})，保守处理`,
      };
    }
    return {
      classification: "mechanics",
      matchedSignals,
      matchedNarrative: [],
      reason: `检测到 mechanics 信号: ${matchedSignals.join(", ")}`,
    };
  }

  // Step 3b: Task action patterns (accept/do/complete + quest/task)
  // "我要接一个任务" → "接" near "任务"
  const taskActionVerbs = ["接", "接受", "做", "完成", "提交", "交", "领", "领取"];
  const hasTaskVerb = taskActionVerbs.some((v) => lowerInput.includes(v));
  const hasTaskNoun = lowerInput.includes("任务") || lowerInput.includes("委托");
  if (hasTaskVerb && hasTaskNoun) {
    return {
      classification: "mechanics",
      matchedSignals: ["任务操作"],
      matchedNarrative: [],
      reason: "检测到任务操作意图（动词+任务）",
    };
  }

  // Step 3c: Forge action patterns
  // "帮我锻造" / "我要打造" → mechanics
  const forgeVerbs = ["锻造", "打造", "制作", "修理", "改装", "强化", "修复"];
  const hasForgeVerb = forgeVerbs.some((v) => lowerInput.includes(v));
  const __hasWeaponNoun = lowerInput.includes("武器") || lowerInput.includes("装备") || lowerInput.includes("剑") || lowerInput.includes("刃");
  if (hasForgeVerb) {
    return {
      classification: "mechanics",
      matchedSignals: ["锻造操作"],
      matchedNarrative: [],
      reason: "检测到锻造操作意图",
    };
  }

  // Step 3d: Combat action patterns
  const combatVerbs = ["攻击", "战斗", "开战", "反击", "格挡", "闪避", "冲锋"];
  const hasCombatVerb = combatVerbs.some((v) => lowerInput.includes(v));
  if (hasCombatVerb) {
    return {
      classification: "mechanics",
      matchedSignals: ["战斗操作"],
      matchedNarrative: [],
      reason: "检测到战斗操作意图",
    };
  }

  // Step 4: 弱 mechanics 信号 → ambiguous
  const weakMatches: string[] = [];
  for (const signal of WEAK_MECHANICS_SIGNALS) {
    if (lowerInput.includes(signal)) {
      weakMatches.push(signal);
    }
  }
  if (weakMatches.length > 0) {
    return {
      classification: "ambiguous",
      matchedSignals: weakMatches,
      matchedNarrative: [],
      reason: `检测到弱 mechanics 信号: ${weakMatches.join("，")}（需要更多上下文确认）`,
    };
  }

  // Step 5: 默认 → narrative
  return {
    classification: "narrative",
    matchedSignals: [],
    matchedNarrative: matchedNarrative.length > 0 ? matchedNarrative : ["(无特殊信号)"],
    reason: matchedNarrative.length > 0
      ? `检测到叙事信号: ${matchedNarrative.join(", ")}`
      : "未检测到明确的 mechanics 信号，默认走叙事路径",
  };
}

/**
 * 快速检查：是否应该尝试 DM Agent 路径
 * 这是 route.ts 中使用的便捷入口
 */
export function shouldAttemptDmAgent(userInput: string): boolean {
  const result = classifyMechanicsIntent(userInput);
  return result.classification === "mechanics";
}

// ============================================================
// Self-Test: Ensure the router is deterministic
// ============================================================

if (import.meta.vitest) {
  // vitest inline tests — not executed at runtime
}

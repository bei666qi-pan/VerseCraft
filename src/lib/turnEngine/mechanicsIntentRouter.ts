// src/lib/ai/tools/mechanicsIntentRouter.ts
/**
 * Mechanics Workflow Mechanics Intent Router
 *
 * 纯函数分类器：判断玩家输入是否包含明确的 mechanics intent，
 * 从而决定是否应进入 Mechanics Workflow 工具调用路径。
 *
 * 规则：
 * - mechanics 意图（任务/锻造/战斗/物品使用/NPC查询/位置查询）→ 允许进入 Agent
 * - narrative 意图（观察/对话/闲聊/探索）→ 禁止进入 Agent，走Writer lane
 * - ambiguous 意图（模糊/混合/咨询方法）→ 保守走旧路径，不应擅自写状态
 *
 * 跨世界（暗月 / 星逆）支持：
 * - Per-world keyword signal 字典覆盖：暗月把"锻造/原石"视为 mechanics，
 *   星逆则把"铸剑/灵石/灵草/修炼/灵根/储物袋"视为修仙专属 mechanics，
 *   而"炼丹/渡劫/悟道/飞升"在星逆里属于 narrative。
 * - 真 embedding 分类器见 `./mechanicsIntentClassifier`，由 TurnLaneRouter 施加 300ms 截止
 *   timeout + 30s LRU + per-world seed 向量；本模块仅做关键词纯函数快路径，
 *   与 embedding 模块互不干扰。
 *
 * 设计约束：
 * - 纯函数，无 IO，零网络请求（与 `/api/chat` first-packet budget 对齐）
 * - 确定性分类，不依赖外部状态
 * - 关键词匹配为主，保守优先
 * - 不参与实时 embedding 调用；embedding 在 `mechanicsIntentClassifier/` 单独管理
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

/** 物品使用信号：玩家意图使用背包中的特定物品 */
const INVENTORY_USE_SIGNALS: readonly string[] = [
  "使用药水", "使用药剂", "使用道具", "使用背包里的", "使用背包中的",
  "喝下药水", "喝下药剂", "喝药水", "喝下",
  "服用", "吃下",
  "用药水", "用药治疗", "用药剂", "用药膏",
  "使用治疗", "使用绷带", "涂抹药膏",
  "使用背包", "从背包", "拿出背包",
];

/** NPC 查询信号：玩家询问 NPC 的服务/商品/库存 */
const NPC_INQUIRY_SIGNALS: readonly string[] = [
  "卖什么", "出售什么", "出售哪些", "卖哪些",
  "有什么服务", "提供什么服务", "能提供什么",
  "的商品", "的货物", "的库存",
  "可买", "可以买", "能买什么", "购买选项",
  "有什么商品", "有什么货物",
  "卖东西", "能卖什么",
  "库存有", "有没有卖",
];

/** 位置查询信号：玩家询问 NPC/设施位置或楼层内容 */
const LOCATION_POSITION_SIGNALS: readonly string[] = [
  "在哪", "在哪里", "的位置", "在什么地方",
  "在哪个", "去哪里找", "上哪找",
];

/** 位置查询辅助：楼层/区域引用 */
const LOCATION_FLOOR_REFERENCES: readonly string[] = [
  "楼层", "这层", "那层", "这楼", "那楼",
  "b1", "b2", "b3", "f1", "f2", "f3",
  "一楼", "二楼", "三楼", "地下一层", "地下二层",
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
// Per-world overrides (星逆 / 修仙)
// ============================================================

/** 星逆专属 mechanics：修仙系统的结构化动作 */
const XINGNI_STRONG_MECHANICS_SIGNALS: readonly string[] = [
  // 灵石/货币操作
  "花费灵石", "消耗灵石", "支付灵石", "结算灵石", "交灵石",
  // 灵草/炼丹/炼器材料
  "炼丹药", "炼制丹药", "炼丹", "炼器", "炼法宝",
  "服用丹药", "服用灵草", "服下丹药",
  // 修炼/灵根操作
  "服用灵草", "吞服丹药", "打坐修炼", "修炼功法", "修炼内功",
  "运转灵力", "运功调息", "调息",
  // 物品 / 储物袋
  "查看储物袋", "打开储物袋", "取出储物袋", "从储物袋",
  // 法宝 / 飞剑
  "祭出飞剑", "祭出法宝", "驱动飞剑", "驱动法宝", "驾驭飞剑",
  "锻造飞剑", "打造飞剑", "炼制飞剑", "锻造法宝",
  "装备法宝", "装备飞剑", "卸下法宝",
  // 战斗 / 阵法
  "布阵", "设阵", "布设阵法", "启动阵法", "激活阵法",
  "御敌", "对敌", "出手", "迎战妖兽", "斩杀妖兽",
  // 任务
  "接宗门任务", "领取悬赏", "交悬赏",
];

/** 星逆专属 weak mechanics：可能修仙动作，需要上下文 */
const XINGNI_WEAK_MECHANICS_SIGNALS: readonly string[] = [
  "灵石", "灵草", "丹药", "丹炉", "丹方", "法宝", "飞剑",
  "储物袋", "阵法", "符箓", "符咒", "内功", "功法", "修为",
  "灵兽", "妖兽",
  "灵根", "境界",
];

/** 星逆专属 narrative：在星逆里这些词属于修仙叙事而非 mechanics */
const XINGNI_STRONG_NARRATIVE_SIGNALS: readonly string[] = [
  "悟道", "顿悟", "渡劫", "飞升", "化神", "入定",
  "感悟天地", "感悟灵气", "灵气感应", "感应天地",
  "灵气充盈", "灵台清明",
];

/** 星逆反 mechanics 信号：在星逆里"锻造/铸剑"等修仙动作常出现于叙事而非执行 */
const XINGNI_ANTI_MECHANICS_SIGNALS: readonly string[] = [
  "铸剑", "炼器", "炼丹",
  // 修仙叙述常用词
  "剑光", "法力", "真气", "灵气", "灵力",
];

// ============================================================
// Router
// ============================================================

/**
 * 分类玩家输入的 mechanics 意图（与 worldId 无关的默认实现）
 *
 * 算法：
 * 1. 检查强 narrative 信号 → 直接分类为 narrative
 * 1.5 检查数据查询意图（NPC 服务/商品、位置/楼层）→ 分类为 mechanics
 * 2. 检查反 mechanics 信号 → 降级为 ambiguous（问题/咨询而非执行）
 * 3. 检查强 mechanics 信号 → 分类为 mechanics
 * 4. 检查弱 mechanics 信号 → 分类为 ambiguous
 * 5. 默认 → narrative
 *
 * @param userInput 玩家原始输入文本
 */
export function classifyMechanicsIntent(userInput: string): MechanicsIntentResult {
  return classifyMechanicsIntentForWorld(userInput, null);
}

/**
 * 按 worldId 分类玩家输入的 mechanics 意图
 *
 * 星逆（xingni_taichu）会叠加修仙专属信号；其它 worldId 等价于默认行为。
 *
 * @param userInput 玩家原始输入文本
 * @param worldId 当前回合 worldId（null/undefined = 与世界无关的默认行为）
 */
export function classifyMechanicsIntentForWorld(
  userInput: string,
  worldId: string | null | undefined
): MechanicsIntentResult {
  const input = userInput.trim();
  const lowerInput = input.toLowerCase();
  const isXingni = worldId === "xingni_taichu";

  const matchedSignals: string[] = [];
  const matchedNarrative: string[] = [];

  // Step 1: 强 narrative 信号 → 直接 narrative
  // 星逆先检查：修仙特有 narrative 信号优先
  const narrativeSignals = isXingni
    ? [...STRONG_NARRATIVE_SIGNALS, ...XINGNI_STRONG_NARRATIVE_SIGNALS]
    : STRONG_NARRATIVE_SIGNALS;
  for (const signal of narrativeSignals) {
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

  // Step 1.5: 数据查询意图 — NPC 服务/商品查询 或 位置/楼层查询
  for (const signal of NPC_INQUIRY_SIGNALS) {
    if (lowerInput.includes(signal)) {
      return {
        classification: "mechanics",
        matchedSignals: [`NPC查询: ${signal}`],
        matchedNarrative: [],
        reason: `检测到 NPC 查询意图（服务/商品）: "${signal}"`,
      };
    }
  }

  // 位置查询：具体询问 NPC/设施位置
  for (const signal of LOCATION_POSITION_SIGNALS) {
    if (lowerInput.includes(signal)) {
      return {
        classification: "mechanics",
        matchedSignals: [`位置查询: ${signal}`],
        matchedNarrative: [],
        reason: `检测到位置查询意图: "${signal}"`,
      };
    }
  }

  // 楼层内容查询：楼层/区域引用 + "有什么"
  const hasFloorRef = LOCATION_FLOOR_REFERENCES.some((f) => lowerInput.includes(f));
  const hasWhatQuery = lowerInput.includes("有什么");
  if (hasFloorRef && hasWhatQuery) {
    return {
      classification: "mechanics",
      matchedSignals: ["位置查询: 楼层内容"],
      matchedNarrative: [],
      reason: "检测到楼层内容查询意图（楼层引用 + 询问内容）",
    };
  }

  // Step 2: 反 mechanics 信号 → ambiguous
  const antiSignals = isXingni
    ? [...ANTI_MECHANICS_SIGNALS, ...XINGNI_ANTI_MECHANICS_SIGNALS]
    : ANTI_MECHANICS_SIGNALS;
  for (const anti of antiSignals) {
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
  if (matchedNarrative.length === 0 && (input.endsWith("吗") || input.endsWith("？") || input.endsWith("?"))) {
    return {
      classification: "ambiguous",
      matchedSignals: [],
      matchedNarrative: ["疑问句"],
      reason: "检测到疑问句（咨询而非执行）",
    };
  }

  // Step 3: 强 mechanics 信号 → mechanics
  // 星逆专属强信号先匹配：修仙系统动作（储物袋/灵石/法宝/阵法）应当压制通用
  // STRONG_NARRATIVE_SIGNALS 中的"检查/搜索"等动作，避免被错误降级为 ambiguous。
  const genericStrongSignals: string[] = [];
  const xingniStrongSignals: string[] = [];
  for (const signal of STRONG_MECHANICS_SIGNALS) {
    if (lowerInput.includes(signal)) genericStrongSignals.push(signal);
  }
  if (isXingni) {
    for (const signal of XINGNI_STRONG_MECHANICS_SIGNALS) {
      if (lowerInput.includes(signal)) xingniStrongSignals.push(signal);
    }
    // 星逆专属信号命中 → 直接 mechanics（不再与通用 narrative 信号合并为 ambiguous）
    if (xingniStrongSignals.length >= 1) {
      matchedSignals.push(...xingniStrongSignals);
      return {
        classification: "mechanics",
        matchedSignals: [...matchedSignals],
        matchedNarrative: [],
        reason: `检测到星逆专属 mechanics 信号: ${xingniStrongSignals.join(", ")}`,
      };
    }
  }
  matchedSignals.push(...genericStrongSignals);
  if (matchedSignals.length >= 1) {
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
      reason: `检测到 mechanics 信号: ${matchedSignals.join(", ")}${isXingni ? "（星逆 per-world）" : ""}`,
    };
  }

  // Step 3b: Task action patterns (accept/do/complete + quest/task)
  const taskActionVerbs = ["接", "接受", "做", "完成", "提交", "交", "领", "领取"];
  const hasTaskVerb = taskActionVerbs.some((v) => lowerInput.includes(v));
  const taskNouns = isXingni
    ? ["任务", "委托", "悬赏", "宗门任务"]
    : ["任务", "委托"];
  const hasTaskNoun = taskNouns.some((n) => lowerInput.includes(n));
  if (hasTaskVerb && hasTaskNoun) {
    return {
      classification: "mechanics",
      matchedSignals: ["任务操作"],
      matchedNarrative: [],
      reason: "检测到任务操作意图（动词+任务）",
    };
  }

  // Step 3c: Forge action patterns
  const forgeVerbs = isXingni
    ? ["锻造", "打造", "制作", "修理", "改装", "强化", "修复", "炼制", "炼器", "炼丹"]
    : ["锻造", "打造", "制作", "修理", "改装", "强化", "修复"];
  const hasForgeVerb = forgeVerbs.some((v) => lowerInput.includes(v));
  const weaponNouns = isXingni
    ? ["武器", "装备", "剑", "刃", "飞剑", "法宝", "丹", "丹药"]
    : ["武器", "装备", "剑", "刃"];
  const __hasWeaponNoun = weaponNouns.some((n) => lowerInput.includes(n));
  if (hasForgeVerb) {
    // 星逆：若只是"炼丹"且无"武器/装备"上下文，可能属于修仙叙述，需结合 narrative 判定
    if (isXingni && matchedNarrative.length > 0) {
      return {
        classification: "ambiguous",
        matchedSignals: ["锻造/炼制操作"],
        matchedNarrative,
        reason: `星逆中同时检测到修仙动作与修仙叙述信号 (${matchedNarrative.join(", ")})，保守处理`,
      };
    }
    return {
      classification: "mechanics",
      matchedSignals: ["锻造操作"],
      matchedNarrative: [],
      reason: isXingni ? "检测到炼制/锻造操作意图（星逆 per-world）" : "检测到锻造操作意图",
    };
  }

  // Step 3d: Combat action patterns
  const combatVerbs = isXingni
    ? ["攻击", "战斗", "开战", "反击", "格挡", "闪避", "冲锋", "斩杀", "御敌", "祭出"]
    : ["攻击", "战斗", "开战", "反击", "格挡", "闪避", "冲锋"];
  const hasCombatVerb = combatVerbs.some((v) => lowerInput.includes(v));
  if (hasCombatVerb) {
    return {
      classification: "mechanics",
      matchedSignals: ["战斗操作"],
      matchedNarrative: [],
      reason: "检测到战斗操作意图",
    };
  }

  // Step 3e: Inventory use patterns — 玩家意图使用背包中的特定物品
  for (const signal of INVENTORY_USE_SIGNALS) {
    if (lowerInput.includes(signal)) {
      return {
        classification: "mechanics",
        matchedSignals: [`物品使用: ${signal}`],
        matchedNarrative: [],
        reason: `检测到物品使用意图: "${signal}"`,
      };
    }
  }

  // Step 3f: 星逆专属 mechanics 模式（灵石 / 储物袋 / 灵草 / 法宝）
  if (isXingni) {
    const xingniStorageVerbs = ["查看储物袋", "打开储物袋", "取出", "拿出"];
    const xingniItemNouns = ["灵石", "丹药", "灵草", "法宝", "飞剑", "符箓"];
    const hasStorageVerb = xingniStorageVerbs.some((v) => lowerInput.includes(v));
    const hasXingniItem = xingniItemNouns.some((n) => lowerInput.includes(n));
    if (hasStorageVerb || (hasXingniItem && (lowerInput.includes("使用") || lowerInput.includes("消耗") || lowerInput.includes("服用")))) {
      return {
        classification: "mechanics",
        matchedSignals: ["星逆物品操作"],
        matchedNarrative: [],
        reason: "检测到星逆物品/储物袋操作意图",
      };
    }
  }

  // Step 4: 弱 mechanics 信号 → ambiguous
  const weakSignals = isXingni
    ? [...WEAK_MECHANICS_SIGNALS, ...XINGNI_WEAK_MECHANICS_SIGNALS]
    : WEAK_MECHANICS_SIGNALS;
  const weakMatches: string[] = [];
  for (const signal of weakSignals) {
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
 * 快速检查：是否应该尝试 Mechanics Workflow 路径（与 worldId 无关）
 *
 * 这是 route.ts 历史入口的便捷包装，行为完全等价于
 * `shouldAttemptMechanicsForWorld(input, undefined)`。
 * 保留以避免破坏历史 import / 测试。
 */
export function shouldAttemptMechanics(userInput: string): boolean {
  const result = classifyMechanicsIntent(userInput);
  return result.classification === "mechanics";
}

/**
 * Per-world Mechanics Workflow 路径判定（纯关键词路径，与 first-packet budget 对齐）
 *
 * 工作流：
 * 1. 用 `classifyMechanicsIntentForWorld` 做 per-world 关键词分类。
 *    暗月时与 `classifyMechanicsIntent` 行为等价；星逆时叠加修仙专属信号。
 * 2. classification === "mechanics" → true；其它 → false（保守）。
 *
 * 真 embedding 路径见 `./mechanicsIntentClassifier`（由 TurnLaneRouter 施加 300ms 截止 +
 * 30s LRU + per-world seed vectors）。本函数有意保持 sync + 纯函数，
 * 不引入 IO，避免污染 `/api/chat` first-packet 预算。
 */
export function shouldAttemptMechanicsForWorld(
  userInput: string,
  worldId?: string | null
): boolean {
  return classifyMechanicsIntentForWorld(userInput, worldId).classification === "mechanics";
}

// ============================================================
// Self-Test: 路由纯函数性质由 src/lib/ai/tools/mechanicsIntentRouter.test.ts 覆盖
// （node:test describe/it 形式，CI 中由 `pnpm test:unit` 触发）
// ============================================================

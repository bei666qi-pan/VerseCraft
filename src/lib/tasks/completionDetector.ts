/**
 * 任务完成检测引擎
 *
 * 从 DM JSON + 叙事文本 + 游戏状态中自动检测任务完成条件。
 * 支持多条件组合：物品收集、位置到达、NPC 交互、叙事关键词、前置任务。
 *
 * 设计原则：
 * - 结构化优先：优先从 DM JSON 的 task_updates 字段识别
 * - 叙事兜底：当结构化字段缺失时，从 narrative 文本中反向检测
 * - 多条件组合：所有 required 条件都必须满足才算完成
 */

import type { GameTaskV2 } from "./taskV2";

// === 完成条件类型 ===

export type CompletionCondition =
  | { type: "item_collected"; itemId: string; label?: string }
  | { type: "location_reached"; locationId: string; label?: string }
  | { type: "npc_interacted"; npcId: string; label?: string }
  | { type: "narrative_keyword"; keywords: string[]; label?: string }
  | { type: "prerequisite_task"; taskId: string; label?: string }
  | { type: "evidence_count"; count: number; label?: string }
  | { type: "originium_threshold"; amount: number; label?: string };

export interface TaskCompletionRule {
  taskId: string;
  /** 条件列表：全部满足才算完成 */
  requiredConditions: CompletionCondition[];
  /** 可选条件：满足任一条可触发「可交付」状态 */
  optionalConditions?: CompletionCondition[];
}

// === 检测输入 ===

export interface CompletionDetectionInput {
  task: GameTaskV2;
  /** DM JSON 的 narrative 文本 */
  narrative: string;
  /** DM JSON 的 task_updates（AI 声明的任务变更） */
  dmTaskUpdates: Array<{ taskId: string; status?: string; note?: string }>;
  /** 当前游戏状态 */
  gameState: CompletionGameState;
}

export interface CompletionGameState {
  inventoryItemIds: string[];
  playerLocation: string | null;
  presentNpcIds: string[];
  completedTaskIds: string[];
  recentNarrativeKeywords: string[];
  originium: number;
  codexNpcIds: string[];
}

export interface CompletionDetectionResult {
  /** 目标是否已达成 */
  objectivesMet: boolean;
  /** 可以交付（objectivesMet + 所有 optional 或 requirement 全部满足） */
  isDeliverable: boolean;
  /** 满足的条件 */
  metConditions: string[];
  /** 未满足的条件 */
  unmetConditions: string[];
  /** 检测方式：structured（DM JSON）/ narrative（文本反向检测）/ hybrid */
  detectionMethod: "structured" | "narrative" | "hybrid" | "none";
  /** 置信度 0-1 */
  confidence: number;
  /** 摘要（用于日志） */
  summary: string;
}

// === 核心检测逻辑 ===

/** 从 DM JSON 的 task_updates 中检测完成 */
function detectFromStructured(taskId: string, dmTaskUpdates: CompletionDetectionInput["dmTaskUpdates"]): { completed: boolean; confidence: number } {
  const update = dmTaskUpdates.find((u) => u.taskId === taskId);
  if (!update) return { completed: false, confidence: 0 };
  if (update.status === "completed") return { completed: true, confidence: 0.9 };
  return { completed: false, confidence: 0 };
}

/** 从叙事文本中反向检测任务完成关键词 */
function detectFromNarrative(task: GameTaskV2, narrative: string): { completed: boolean; confidence: number; matchedKeywords: string[] } {
  const __narrative_lower = narrative.toLowerCase();
  const keywords: string[] = [];
  let score = 0;

  // 通用完成暗示
  if (/(?:终于|已经|成功).*(?:找到|完成|解决|拼好|凑齐|确认)/.test(narrative)) {
    score += 0.3;
    keywords.push("general_completion");
  }

  // 任务标题关键词匹配（逐字匹配，至少匹配 50% 的标题字符）
  const titleChars = task.title.replace(/[的了吧吗呢啊寻找调查检查前往去]/g, "").split("");
  const titleMatchCount = titleChars.filter((ch) => narrative.includes(ch)).length;
  if (titleChars.length >= 2 && titleMatchCount >= Math.ceil(titleChars.length * 0.5)) {
    score += 0.2;
    keywords.push(`title_match:${titleMatchCount}/${titleChars.length}`);
  }

  // 交付暗示
  if (/(?:交给|递给|拿给|送回|归还).*(?:他|她|它|了)/.test(narrative)) {
    score += 0.15;
    keywords.push("delivery_implied");
  }

  // NPC 名称 + 完成动词
  if (task.issuerName && new RegExp(`${task.issuerName}.*(?:点头|微笑|接过|满意|说|收起)`).test(narrative)) {
    score += 0.2;
    keywords.push("issuer_reaction");
  }

  // 任务描述中的关键物品被提及
  if (task.desc) {
    const descNouns = task.desc.replace(/[，。、；：！？\s]/g, "").slice(0, 10);
    const matched = [...descNouns].filter((ch) => narrative.includes(ch)).length;
    if (matched >= 3) {
      score += 0.1;
      keywords.push(`desc_match:${matched}`);
    }
  }

  return {
    completed: score >= 0.5,
    confidence: Math.min(0.7, score),
    matchedKeywords: keywords,
  };
}

/** 检查具体条件 */
function _checkCondition(condition: CompletionCondition, state: CompletionGameState): boolean {
  switch (condition.type) {
    case "item_collected":
      return state.inventoryItemIds.includes(condition.itemId);
    case "location_reached":
      return state.playerLocation === condition.locationId;
    case "npc_interacted":
      return state.presentNpcIds.includes(condition.npcId);
    case "narrative_keyword":
      return condition.keywords.some((kw) =>
        state.recentNarrativeKeywords.some((nk) => nk.includes(kw))
      );
    case "prerequisite_task":
      return state.completedTaskIds.includes(condition.taskId);
    case "evidence_count":
      // evidence = 图鉴中的 NPC + 线索（用 recentNarrativeKeywords 近似）
      return (state.codexNpcIds.length + state.recentNarrativeKeywords.length) >= condition.count;
    case "originium_threshold":
      return state.originium >= condition.amount;
    default:
      return false;
  }
}

// === 主导出函数 ===

export function detectTaskCompletion(input: CompletionDetectionInput): CompletionDetectionResult {
  const { task, narrative, dmTaskUpdates, gameState } = input;

  // 1. 结构化检测
  const structured = detectFromStructured(task.id, dmTaskUpdates);

  // 即使结构化检测通过，也需检查 requiredItemIds
  // （不提前返回，统一走下面的条件检查流程）

  // 2. 叙事文本检测
  const narrative_detection = detectFromNarrative(task, narrative);

  // 3. 组合检测：结构化 + 叙事
  const metConditions: string[] = [];
  const unmetConditions: string[] = [];

  if (structured.completed) {
    metConditions.push("dm_structured:completed");
  }

  if (narrative_detection.completed) {
    metConditions.push(`narrative:${narrative_detection.matchedKeywords.join(",")}`);
  }

  // 4. 检查显式条件（如果任务定义了 requiredItemIds 等）
  if (task.requiredItemIds && task.requiredItemIds.length > 0) {
    for (const itemId of task.requiredItemIds) {
      if (gameState.inventoryItemIds.includes(itemId)) {
        metConditions.push(`item:${itemId}`);
      } else {
        unmetConditions.push(`item:${itemId}`);
      }
    }
  }

  // 5. 判定
  const objectivesMet = structured.completed || narrative_detection.completed || metConditions.length > 0;
  const isDeliverable = objectivesMet && unmetConditions.length === 0;

  let detectionMethod: CompletionDetectionResult["detectionMethod"] = "none";
  if (structured.completed && narrative_detection.completed) detectionMethod = "hybrid";
  else if (structured.completed) detectionMethod = "structured";
  else if (narrative_detection.completed) detectionMethod = "narrative";

  const confidence = structured.completed
    ? Math.max(structured.confidence, narrative_detection.confidence)
    : narrative_detection.confidence;

  return {
    objectivesMet,
    isDeliverable,
    metConditions,
    unmetConditions,
    detectionMethod,
    confidence,
    summary: objectivesMet
      ? `任务「${task.title}」目标已达成（${detectionMethod}，置信度 ${(confidence * 100).toFixed(0)}%）`
      : `任务「${task.title}」目标未达成（未满足：${unmetConditions.join("、") || "无显式条件"})`,
  };
}

// === 批量检测 ===

export function detectAllActiveTasks(
  tasks: GameTaskV2[],
  narrative: string,
  dmTaskUpdates: CompletionDetectionInput["dmTaskUpdates"],
  gameState: CompletionGameState
): CompletionDetectionResult[] {
  return tasks
    .filter((t) => t.status === "active" || t.status === "available")
    .map((task) => detectTaskCompletion({ task, narrative, dmTaskUpdates, gameState }));
}

// === 从叙事中提取关键词（供 gameState.recentNarrativeKeywords 使用） ===

export function extractNarrativeKeywords(narrative: string, maxKeywords = 8): string[] {
  const keywords: string[] = [];
  // 物品
  const itemMatches = narrative.match(/(?:捡起|找到|发现|获得|拿到|收好|递给|交给|给了)(.{1,8})(?:了|，|。|$)/g);
  if (itemMatches) keywords.push(...itemMatches.map((m) => m.slice(0, 10)));

  // NPC
  const npcMatches = narrative.match(/(?:廖暗|麟泽|欣蓝|老刘|苏弥|夜读老人|双胞胎)/g);
  if (npcMatches) keywords.push(...npcMatches);

  // 位置
  const locMatches = narrative.match(/(?:配电间|登记口|画室|走廊|楼梯间|消防通道|电梯|教室|办公室|储物间)/g);
  if (locMatches) keywords.push(...locMatches);

  return [...new Set(keywords)].slice(0, maxKeywords);
}

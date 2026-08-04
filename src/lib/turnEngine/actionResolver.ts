/**
 * actionResolver.ts — 从叙事文本反向提取结构化字段，自动回填
 *
 * 调研背景：RPGBench 证明最强 LLM 的 Mechanic Score 仅 0.765，
 * 即约 1/4 回合的 AI 生成内容存在规则/状态更新错误。
 * 当 AI 叙事明确描述了某个游戏操作（拾取/消耗/任务推进/货币变化）
 * 但对应的结构化字段为空时，本模块从叙事文本中反向提取并补全。
 *
 * 设计原则：
 * - 保守：仅当叙事包含高置信度关键词时才回填
 * - 非破坏：不修改已有结构化数据，仅补充空字段
 * - 可审计：每次回填写入遥测
 */

// 物品拾取关键词模式
// 注意：发现/拿到/获得太宽泛，仅在前面有量词（一个/一张/一把等）时才认为可能指物品
const PICKUP_PATTERNS = [
  /捡起[了]?\s*(.{1,12})/,
  /拾起[了]?\s*(.{1,12})/,
  /发现[了]?\s*(?:一个|一张|一把|一只|一根|一条|一块|一本|一枚|一件)?(.{1,12})(?:在|，|。|$)/,
  /拿到[了]?\s*(?:一个|一张|一把|一只|一根|一条|一块|一本|一枚|一件)?(.{1,12})(?:，|。|$)/,
  /获得[了]?\s*(?:一个|一张|一把|一只|一根|一条|一块|一本|一枚|一件)?(.{1,12})(?:，|。|$)/,
  /收[好起][了]?\s*(.{1,12})/,
  /掏[出到][了]?\s*(.{1,12})/,
];

// 已知的非物品短语（正则匹配），不应作为物品回填
const NON_ITEM_PATTERNS = [
  /^没有/,
  /^没/,
  /^明确/,
  /^自己/,
  /^手指/,
  /^手[在的]/,
  /坏了$/,
  /^坏了/,
  /^那个/,
  /^这个/,
  /^什么/,
  /^他[们]/,
  /^她[们]/,
  /^它[们]/,
  /^一个/,
  /^威胁/,
  /^危险/,
  /^东西/,
  /^动静/,
  /^声音/,
  /^人影/,
  /^影子/,
  /^脚步/,
  /^呼吸/,
  /^目光/,
  /^视线/,
  /^感觉/,
  /^异常/,
  /^变化/,
  /^痕迹/,
  /^气味/,
  /刮痕$/,
  /^边缘/,
  /^木框/,
  /^一道/,
  /^道刮/,
  /裂缝$/,
  /污渍$/,
  /水渍$/,
  /划痕$/,
];

// 物品消耗关键词模式
const CONSUME_PATTERNS = [
  /用[掉完][了]?\s*(.{1,12})/,
  /消耗[了]?\s*(.{1,12})/,
  /撕开.*?包装/,
  /拧开.*?瓶盖/,
  /吞下[了]?\s*(.{1,12})/,
  /注射[了]?\s*(.{1,12})/,
  /涂[上抹][了]?\s*(.{1,12})/,
];

// 任务完成暗示
const TASK_COMPLETE_PATTERNS = [
  /终于(?:完成了?|找到[了]?|拼[好凑][了]?)(.{1,16})/,
  /任务.*?完成/,
  /(?:线索|证据|档案).*?(?:齐全|完整|拼[好齐上凑])/,
  /交给[了]?\s*(.{1,8})(?:，|。|$)/,
];

// 货币/原石变化暗示
const CURRENCY_PATTERNS = [
  /捏碎.*?原石/,
  /使用[了]?\s*(?:一块|一颗)\s*原石/,
  /花费[了]?\s*(\d+)\s*(?:块|颗)\s*原石/,
  /原石.*?消耗/,
];

export interface ActionBackfillResult {
  didBackfill: boolean;
  awardedItems?: Array<{ id: string; name: string }>;
  consumedItems?: Array<{ id: string; name: string }>;
  originiumDelta?: number;
  taskUpdates?: Array<{ taskHint: string }>;
  telemetry: {
    pickupAttempts: number;
    consumeAttempts: number;
    taskCompleteAttempts: number;
    currencyAttempts: number;
  };
}

function extractMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) {
      // The broad legacy capture permits up to 12 characters so that compound
      // Chinese item names remain usable. Never let it cross a clause boundary:
      // otherwise “捡起了黄铜钥匙，迅速塞进口袋” becomes a fabricated item name.
      let extracted = m[1].split(/[，。！？；、\s]/, 1)[0]?.trim() ?? "";
      // Strip trailing particles that often get captured with items
      extracted = extracted.replace(/[了的]$/, "");
      // 过滤掉明显不是物品名的提取
      if (
        extracted.length >= 2 &&
        extracted.length <= 10 &&
        !NON_ITEM_PATTERNS.some((p) => p.test(extracted)) &&
        !/^(他|她|它|自己|一个|那个|这个|东西|什么)$/.test(extracted)
      ) {
        return extracted;
      }
    }
  }
  return null;
}

/**
 * 从叙事文本中反向提取游戏操作并生成回填数据。
 *
 * @param narrative DM 生成的叙事文本
 * @param existingAwardedItems 已有的 awarded_items（不为空时跳过拾取回填）
 * @param existingConsumedItems 已有的 consumed_items（不为空时跳过消耗回填）
 * @param existingOriginiumChange 已有的 currency_change.originium（不为空时跳过原石回填）
 * @param hasTaskUpdates 是否已有 task_updates（已有时跳过任务回填）
 */
export function resolveActionsFromNarrative(args: {
  narrative: string;
  existingAwardedItems?: unknown[];
  existingConsumedItems?: unknown[];
  existingOriginiumChange?: number | null;
  hasTaskUpdates?: boolean;
}): ActionBackfillResult {
  const narrative = args.narrative;
  const telemetry = {
    pickupAttempts: 0,
    consumeAttempts: 0,
    taskCompleteAttempts: 0,
    currencyAttempts: 0,
  };

  const result: ActionBackfillResult = {
    didBackfill: false,
    telemetry,
  };

  // 1. 拾取回填：叙事说"捡起X"但 awarded_items 为空
  if (!args.existingAwardedItems || args.existingAwardedItems.length === 0) {
    const item = extractMatch(narrative, PICKUP_PATTERNS);
    if (item) {
      telemetry.pickupAttempts = 1;
      result.awardedItems = [{ id: `auto_${item}`, name: item }];
      result.didBackfill = true;
    }
  }

  // 2. 消耗回填：叙事说"用掉X"但 consumed_items 为空
  if (!args.existingConsumedItems || args.existingConsumedItems.length === 0) {
    const item = extractMatch(narrative, CONSUME_PATTERNS);
    if (item) {
      telemetry.consumeAttempts = 1;
      result.consumedItems = [{ id: `auto_${item}`, name: item }];
      result.didBackfill = true;
    }
  }

  // 3. 原石回填：叙事暗示使用原石但 currency_change 为空
  if (args.existingOriginiumChange === null || args.existingOriginiumChange === undefined) {
    if (CURRENCY_PATTERNS.some((p) => p.test(narrative))) {
      telemetry.currencyAttempts = 1;
      result.originiumDelta = -1; // 默认消耗 1 块原石
      result.didBackfill = true;
    }
  }

  // 4. 任务回填：叙事暗示任务推进但 task_updates 为空
  if (!args.hasTaskUpdates) {
    if (TASK_COMPLETE_PATTERNS.some((p) => p.test(narrative))) {
      telemetry.taskCompleteAttempts = 1;
      // 不直接创建任务更新（需要知道 task ID），而是标记以便上层处理
      result.taskUpdates = [{ taskHint: "narrative_implied_completion" }];
      result.didBackfill = true;
    }
  }

  return result;
}

/**
 * 获取回填遥测摘要（用于 analytics event payload）
 */
export function getBackfillTelemetrySummary(result: ActionBackfillResult): Record<string, number> {
  return {
    backfill_did_run: result.didBackfill ? 1 : 0,
    backfill_pickup: result.telemetry.pickupAttempts,
    backfill_consume: result.telemetry.consumeAttempts,
    backfill_task: result.telemetry.taskCompleteAttempts,
    backfill_currency: result.telemetry.currencyAttempts,
  };
}

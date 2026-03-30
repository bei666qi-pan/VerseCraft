/**
 * 阶段 5 — 时间规则与「游戏小时」分数映射。
 *
 * --- 审计（代码层依赖 consumes_time / advanceTime）---
 * - `src/app/play/page.tsx`：`shouldAdvanceTime` → `applyGameTimeFromResolvedTurn`（按 consumes_time / time_cost 累计分数，满 1 才 +1 显示小时并 tick 冷却）。
 * - `src/store/useGameStore.ts`：`applyGameTimeFromResolvedTurn` / `advanceTime` 在满整点时推进 day/hour，并逐小时原石掷骰、天赋冷却、武器灌注 tick。
 * - `taskV2` / `applyNpcProactiveGrantGuard`：`currentHourIndex = day*24+hour` 与任务发放冷却比较。
 * - 各处 `getPromptContext` / 记忆 / 威胁等用 `nowHour` 同源。
 *
 * 「一律 ≈1h」的叙事代价：试探对话、情绪停顿、校源暗示、关系渐进被与跨层移动、硬碰硬等量齐观；
 * 高魅力 NPC 多轮微互动会不合理地烧掉大量表观时间，冷却与发放节奏也被绑死在粗粒度回合上。
 *
 * 兼容：`consumes_time===false` 仍不增加进度；未带 `time_cost` 且 `consumes_time!==false` 仍等价 +1.0 小时分数（与旧版 +1h 一致）。
 */

import type { ActionTimeCostKind } from "./actionCost";

/** 各档位相对「一整游戏小时」的权重；standard=1 对齐旧默认 */
export const ACTION_TIME_HOUR_FRACTION: Record<ActionTimeCostKind, number> = {
  free: 0,
  light: 0.22,
  standard: 1,
  heavy: 1.35,
  dangerous: 1.65,
};

/**
 * 叙事建议（供 prompt / 注释，非运行时强制）：
 * - free：纯反应、半句搭话、未形成行动闭环
 * - light：轻微观察、简短试探
 * - standard：认真交涉、单场景内完整推进
 * - heavy：跨楼层移动、服务/锻造/交易等正式流程、较长探索
 * - dangerous：危机逃离、硬碰硬、强后果检定
 */
export const ACTION_TIME_COST_GUIDE: Record<ActionTimeCostKind, string> = {
  free: "无表观小时推进（仍可能消耗叙事注意力）",
  light: "极短试探/观察，累计多轮才凑满一小时",
  standard: "与旧版一回合一小时对齐",
  heavy: "明显超过单回合琐事的时间体量",
  dangerous: "高压对抗或长距离脱险",
};

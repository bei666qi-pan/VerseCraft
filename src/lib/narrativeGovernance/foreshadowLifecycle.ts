/**
 * Phase-5: 伏笔生命周期状态机（纯函数，不依赖 DB）。
 *
 * 状态流转：planted → (due) → paid_off / expired
 * - planted: 已播种，等待到期
 * - paid_off: 已兑现（DM 发 payoff op 或 registerClassifier 判为 payoff）
 * - expired: 超过 deadline_turn 未兑现
 *
 * @module foreshadowLifecycle
 */

// ============================================================
// 类型
// ============================================================

export type ForeshadowStatus = "planted" | "paid_off" | "expired";

export type ForeshadowEntry = {
  id: number;
  seedText: string;
  source: string;
  plantedTurn: number;
  status: ForeshadowStatus;
  deadlineTurn: number | null;
  importance: number;
  payoffTurn: number | null;
};

// ============================================================
// 纯函数：状态机
// ============================================================

/**
 * 计算 deadline_turn：planted_turn + importance × 8。
 * importance 1→8 回合，2→16，3→24。
 */
export function computeDeadlineTurn(
  plantedTurn: number,
  importance: number,
): number {
  const imp = Math.max(1, Math.min(3, Math.round(importance || 1)));
  return plantedTurn + imp * 8;
}

/**
 * 判断条目是否到期（当前回合 ≥ deadline_turn - 3）。
 * 到期条目应被注入节奏指令，建议 DM 本回合回收。
 */
export function isDue(entry: ForeshadowEntry, currentTurn: number): boolean {
  if (entry.status !== "planted") return false;
  if (entry.deadlineTurn == null) return false;
  return currentTurn >= entry.deadlineTurn - 3;
}

/**
 * 判断条目是否过期（当前回合 > deadline_turn）。
 */
export function isExpired(entry: ForeshadowEntry, currentTurn: number): boolean {
  if (entry.status !== "planted") return false;
  if (entry.deadlineTurn == null) return false;
  return currentTurn > entry.deadlineTurn;
}

/**
 * 从一组条目中筛选出到期且优先级最高的最多 N 条。
 * 排序：importance DESC, plantedTurn ASC（先种的先兑现）。
 */
export function pickDueEntries(
  entries: ForeshadowEntry[],
  currentTurn: number,
  maxCount: number = 2,
): ForeshadowEntry[] {
  return entries
    .filter((e) => isDue(e, currentTurn))
    .sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return a.plantedTurn - b.plantedTurn;
    })
    .slice(0, maxCount);
}

/**
 * 标记 payoff：返回新的 status 和 payoffTurn。
 */
export function markPayoff(
  entry: ForeshadowEntry,
  currentTurn: number,
): { status: ForeshadowStatus; payoffTurn: number } {
  return { status: "paid_off", payoffTurn: currentTurn };
}

/**
 * 标记 expired：返回新的 status。
 * 纯状态转换，不需要 entry 内容。
 */
export function markExpired(): { status: ForeshadowStatus } {
  return { status: "expired" };
}

/**
 * 将到期条目转换为节奏指令片段（建议式，不强制）。
 */
export function dueToDirectiveFragment(
  entries: readonly ForeshadowEntry[],
): string {
  if (entries.length === 0) return "";
  const summaries = entries
    .map((e) => {
      const text = e.seedText.length > 30 ? e.seedText.slice(0, 30) + "…" : e.seedText;
      return `「${text}」`;
    })
    .join("、");
  return `如剧情自然，本回合可回收伏笔：${summaries}`;
}

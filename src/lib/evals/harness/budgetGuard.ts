/**
 * Budget Guard — 控制 live 调用次数
 *
 * Phase 6 中所有 live 评测必须经此守卫检查。
 * 单日上限 2000 次，超限自动转 mock 并记录。
 */

import fs from "node:fs";
import path from "node:path";
import { BUDGET } from "./config";

export interface BudgetState {
  date: string; // YYYY-MM-DD
  count: number;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStatePath(): string {
  return path.resolve(".runtime-data", "budget-state.json");
}

function readState(): BudgetState {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf8");
    const state = JSON.parse(raw) as BudgetState;
    if (state.date === getToday()) return state;
  } catch {
    // 不存在或无法解析
  }
  return { date: getToday(), count: 0 };
}

function writeState(state: BudgetState): void {
  const dir = path.dirname(getStatePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getStatePath(), JSON.stringify(state));
}

/**
 * 检查并消耗一次 live 调用预算。
 * @returns true=预算充足，false=已超限
 */
export function tryConsumeBudget(): boolean {
  const state = readState();
  if (state.count >= BUDGET.DAILY_TOTAL) {
    console.warn(`[BudgetGuard] 当日 live 调用已达上限 ${BUDGET.DAILY_TOTAL}，自动转为 mock`);
    return false;
  }
  state.count += 1;
  writeState(state);
  return true;
}

/** 获取当日已用调用数 */
export function getDailyUsage(): number {
  return readState().count;
}

/** 获取当日剩余调用数 */
export function getDailyRemaining(): number {
  return Math.max(0, BUDGET.DAILY_TOTAL - getDailyUsage());
}

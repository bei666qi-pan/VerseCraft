import type { ActionTimeCostKind } from "./actionCost";
import { ACTION_TIME_HOUR_FRACTION } from "./timeRules";

const SCALE = 1_000_000;

/**
 * 由 DM 布尔与可选档位解析「本回合应计入的整小时分数」。
 * - `consumes_time === false` → 0（旧契约）
 * - `time_cost === "free"` → 0（表观时间不动，可与 consumes_time true 同用，表「对白不推进时钟」）
 * - 否则有合法 `time_cost` → 用映射；无则视为 legacy：`+1.0`
 */
export function resolveHourProgressDelta(
  consumes_time: boolean,
  time_cost: ActionTimeCostKind | undefined
): number {
  if (consumes_time === false) return 0;
  if (time_cost === "free") return 0;
  if (time_cost && typeof ACTION_TIME_HOUR_FRACTION[time_cost] === "number") {
    return ACTION_TIME_HOUR_FRACTION[time_cost];
  }
  return 1;
}

export type SplitProgressResult = { wholeHours: number; newPending: number };

/**
 * 将上一余量与本回合增量合并，输出整小时进位数与新的 [0,1) 余量（用定点避免漂移）。
 */
export function splitProgress(pendingRaw: number, deltaRaw: number): SplitProgressResult {
  const safePending = Number.isFinite(pendingRaw) && pendingRaw > 0 ? pendingRaw : 0;
  const safeDelta = Number.isFinite(deltaRaw) && deltaRaw > 0 ? deltaRaw : 0;
  let micros = Math.round(safePending * SCALE) + Math.round(safeDelta * SCALE);
  const wholeHours = Math.floor(micros / SCALE);
  micros = micros % SCALE;
  const newPending = micros / SCALE;
  return { wholeHours, newPending: Math.min(0.999999, Math.max(0, newPending)) };
}

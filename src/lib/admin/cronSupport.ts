/** 将未知输入钳制为 [min, max] 区间内的整数天数值。raw 不可解析时使用 fallback。 */
import { clamp } from "@/lib/clamp";
export function clampDays(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(Math.trunc(n), min, max);
}

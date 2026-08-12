// src/lib/clamp.ts
/**
 * 将 value 限制在 [min, max] 区间内。
 * - 若 value < min，返回 min
 * - 若 value > max，返回 max
 * - 否则返回 value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

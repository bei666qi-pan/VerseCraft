/**
 * True only for the very first screen of a new run: no dialogue in logs yet and time not advanced.
 * 用于嵌入式固定叙事 UI；与「是否仍需本地选项池」脱钩（首轮 options 由主笔生成）。
 * 存档恢复时若已离开冷开场，不得因 `currentOptions` 为空误判仍在首屏。
 */
export function isColdPlayOpening(input: {
  logs?: Array<{ role?: string } | null | undefined> | null;
  time?: { day?: number; hour?: number } | null;
}): boolean {
  const logs = input.logs ?? [];
  if (logs.some((l) => l && l.role === "assistant")) return false;
  if (logs.some((l) => l && l.role === "user")) return false;
  const day = input.time?.day ?? 0;
  const hour = input.time?.hour ?? 0;
  if (day > 0 || hour > 0) return false;
  return true;
}

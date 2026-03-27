/**
 * 后台时长展示统一格式：
 * - 输入统一按“秒”处理；
 * - 输出固定为“X小时Y分”或“Y分”，避免各页面各算一遍导致口径不一致。
 */
export function formatDurationHoursMinutes(totalSeconds: number): string {
  const sec = Number.isFinite(totalSeconds) ? Math.max(0, Math.trunc(totalSeconds)) : 0;
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (hours <= 0) return `${minutes}分`;
  return `${hours}小时${minutes}分`;
}

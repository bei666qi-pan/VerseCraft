/**
 * 学制/循环/高魅力 runtime packet 共用的短行策略（避免各处魔法数分叉）。
 */

export const RUNTIME_PACKET_ANTI_DUMP =
  "即使玩家追问，亦须分步交付；本包为预算上限，非一次性必答清单。";

/**
 * 与历史手写 `text.length > n ? slice + … : text` 一致：`length === maxChars` 不截断、不加省略号。
 */
export function clipPacketLine(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const ellipsis = "…";
  const head = Math.max(0, maxChars - ellipsis.length);
  return `${text.slice(0, head)}${ellipsis}`;
}

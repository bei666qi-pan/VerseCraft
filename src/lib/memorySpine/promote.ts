import type { MemorySpineEntry } from "./types";
import { pickPromotionTexts } from "./prompt";

/**
 * 仅选择极少数高价值记忆，投影为“事实候选文本”（供服务端 persistTurnFacts 使用）。
 * - best-effort / budgeted：不得阻塞前端提交或 TTFT
 * - 不上传完整记忆数组，只上传少量短文本
 */
export function selectPromotionFactTexts(entries: MemorySpineEntry[]): string[] {
  return pickPromotionTexts(entries ?? [], { maxItems: 2, maxCharsPerItem: 96 });
}


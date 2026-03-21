import { DEFAULT_FOUR_ACTION_OPTIONS } from "@/features/play/opening/openingCopy";
import { useGameStore } from "@/store/useGameStore";

/**
 * 开场在仍无助手日志时的最后降级：不 pushLog（正文已由前端嵌入式展示），注入默认可玩选项。
 * 避免「主笔推演」卡死且无选项。
 */
export function injectLocalOpeningFallback(): void {
  useGameStore.getState().setCurrentOptions([...DEFAULT_FOUR_ACTION_OPTIONS]);
}

import { pickEmbeddedOpeningOptions } from "@/features/play/opening/openingOptionPools";
import { useGameStore } from "@/store/useGameStore";

/**
 * 开场在仍无助手日志时的最后降级：不 pushLog（正文已由前端嵌入式展示），注入本地随机选项池。
 * 避免「主笔推演」卡死且无选项。
 */
export function injectLocalOpeningFallback(): void {
  useGameStore.getState().setCurrentOptions([...pickEmbeddedOpeningOptions()]);
}

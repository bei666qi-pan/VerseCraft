import { useGameStore } from "@/store/useGameStore";

/**
 * 开场在仍无助手日志时的最后降级：不 pushLog（正文已由前端嵌入式展示），仅清空选项。
 * 避免重复叙事段落与错误提示长期误显。
 */
export function injectLocalOpeningFallback(): void {
  useGameStore.getState().setCurrentOptions([]);
}

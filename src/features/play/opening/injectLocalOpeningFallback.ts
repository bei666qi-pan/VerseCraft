import { useGameStore } from "@/store/useGameStore";
import { LOCAL_FALLBACK_OPENING_NARRATIVE } from "./openingCopy";

/** 开场超时：仅注入固定叙事，选项保持为空，避免非 AI 选项混入首回合 */
export function injectLocalOpeningFallback(): void {
  const state = useGameStore.getState();
  state.pushLog({ role: "assistant", content: LOCAL_FALLBACK_OPENING_NARRATIVE });
  state.setCurrentOptions([]);
}

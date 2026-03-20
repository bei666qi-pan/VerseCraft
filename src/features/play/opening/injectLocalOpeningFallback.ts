import { useGameStore } from "@/store/useGameStore";
import { DEFAULT_FOUR_ACTION_OPTIONS, LOCAL_FALLBACK_OPENING_NARRATIVE } from "./openingCopy";

/** Same imperative as the opening timeout interval body: one assistant log + default options. */
export function injectLocalOpeningFallback(): void {
  const state = useGameStore.getState();
  state.pushLog({ role: "assistant", content: LOCAL_FALLBACK_OPENING_NARRATIVE });
  state.setCurrentOptions([...DEFAULT_FOUR_ACTION_OPTIONS]);
}

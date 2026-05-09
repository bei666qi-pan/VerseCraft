export type StorageMode = "normal" | "degraded";

export const HYDRATION_SOFT_DEADLINE_MS = 3000;
export const HYDRATION_HARD_DEADLINE_MS = 6000;

type PersistLikeState = {
  isGameStarted?: unknown;
  logs?: unknown;
  playerName?: unknown;
  currentSaveSlot?: unknown;
  saveSlots?: unknown;
  user?: unknown;
  guestId?: unknown;
  isGuest?: unknown;
  storageMode?: unknown;
  isHydrated?: unknown;
};

export function hasLiveGameplayState(state: PersistLikeState): boolean {
  const logs = Array.isArray(state.logs) ? state.logs : [];
  const playerName = typeof state.playerName === "string" ? state.playerName.trim() : "";
  return state.isGameStarted === true || logs.length > 0 || playerName.length > 0;
}

export function mergePersistedStateAfterHydrationDeadline<T extends PersistLikeState>(
  persistedState: unknown,
  currentState: T
): T {
  if (!persistedState || typeof persistedState !== "object" || Array.isArray(persistedState)) {
    return currentState;
  }
  const persisted = persistedState as PersistLikeState;
  const base = {
    ...currentState,
    ...(persisted as Partial<T>),
    storageMode: currentState.storageMode === "degraded" ? "degraded" : "normal",
  } as T;

  if (currentState.storageMode !== "degraded" || !hasLiveGameplayState(currentState)) {
    return base;
  }

  return {
    ...base,
    ...currentState,
    saveSlots: currentState.saveSlots ?? persisted.saveSlots,
    currentSaveSlot: currentState.currentSaveSlot ?? persisted.currentSaveSlot,
    user: currentState.user ?? persisted.user,
    guestId: currentState.guestId ?? persisted.guestId,
    isGuest: typeof currentState.isGuest === "boolean" ? currentState.isGuest : persisted.isGuest,
    storageMode: "degraded",
    isHydrated: true,
  } as T;
}

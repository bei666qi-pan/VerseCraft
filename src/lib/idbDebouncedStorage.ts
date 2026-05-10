// src/lib/idbDebouncedStorage.ts
// Debounced IndexedDB adapter to mitigate write amplification.
// Flushes on pagehide/beforeunload to avoid bfcache transaction lock (Safari).

import type { StateStorage } from "zustand/middleware";

const DEFAULT_DEBOUNCE_MS = 1000;

export type DebouncedStorageOptions = {
  /** When true, this instance backs `flushGameStorePersistenceDebouncedWrites()`. Only one logical game store adapter should enable this. */
  registerGamePersistenceFlush?: boolean;
};

let gamePersistenceFlushPending: null | (() => Promise<void>) = null;

/**
 * Immediately writes pending debounced blob for the main game store persistence adapter.
 */
export async function flushGameStorePersistenceDebouncedWrites(): Promise<void> {
  if (!gamePersistenceFlushPending) return;
  await gamePersistenceFlushPending().catch(() => {
    /* same fire-and-forget semantics as unload flush */
  });
}

export function createDebouncedStorage(
  base: StateStorage,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  opts?: DebouncedStorageOptions
): StateStorage {
  let pending: { name: string; value: string } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function flushPendingAsync(): Promise<void> {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (!pending) return;
    const job = pending;
    pending = null;
    try {
      await Promise.resolve(base.setItem(job.name, job.value));
    } catch {
      /* IDB/store write failure - avoid unhandled rejection; state remains in memory */
    }
  }

  function flushSyncFireForget() {
    void flushPendingAsync();
  }

  if (opts?.registerGamePersistenceFlush) {
    gamePersistenceFlushPending = flushPendingAsync;
  }

  if (typeof window !== "undefined") {
    const onUnload = () => {
      flushSyncFireForget();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushSyncFireForget();
      }
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    getItem: base.getItem.bind(base),

    setItem: (name: string, value: string) => {
      pending = { name, value };
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => flushSyncFireForget(), debounceMs);
    },

    removeItem: (name: string) => {
      void flushPendingAsync();
      return base.removeItem(name);
    },
  };
}

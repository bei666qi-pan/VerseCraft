// src/lib/idbDebouncedStorage.ts
// Debounced IndexedDB adapter to mitigate write amplification.
// Accumulates state changes and delays JSON.stringify + DB write until inactivity.

import type { StateStorage } from "zustand/middleware";

const DEFAULT_DEBOUNCE_MS = 1000;

export function createDebouncedStorage(
  base: StateStorage,
  debounceMs = DEFAULT_DEBOUNCE_MS
): StateStorage {
  let pending: { name: string; value: string } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (pending) {
      void base.setItem(pending.name, pending.value);
      pending = null;
    }
  }

  return {
    getItem: base.getItem.bind(base),

    setItem: (name: string, value: string) => {
      pending = { name, value };
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(flush, debounceMs);
    },

    removeItem: (name: string) => {
      flush();
      return base.removeItem(name);
    },
  };
}

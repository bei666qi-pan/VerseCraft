// Resilient storage: IDB with timeout + localStorage fallback.
// Mitigates "stuck loading" when IndexedDB hangs (e.g. mobile Safari private mode).
// When IDB times out or fails, falls back to localStorage so app never blocks.

import type { StateStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

const GET_ITEM_TIMEOUT_MS = 3000;
const SET_ITEM_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function getLocalItem(name: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function setLocalItem(name: string, value: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(name, value);
  } catch {
    /* ignore */
  }
}

function removeLocalItem(name: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(name);
  } catch {
    /* ignore */
  }
}

export function createResilientIdbStorage(): StateStorage {
  return {
    getItem: async (name: string): Promise<string | null> => {
      let value: string | null = null;
      try {
        const idbResult = await withTimeout(get(name), GET_ITEM_TIMEOUT_MS);
        if (idbResult != null && typeof idbResult === "string") return idbResult;
      } catch {
        /* IDB threw, fall through to localStorage */
      }
      return getLocalItem(name);
    },

    setItem: async (name: string, value: string): Promise<void> => {
      try {
        const ok = await withTimeout(set(name, value), SET_ITEM_TIMEOUT_MS);
        if (ok === null) setLocalItem(name, value);
      } catch {
        setLocalItem(name, value);
      }
    },

    removeItem: async (name: string): Promise<void> => {
      try {
        const ok = await withTimeout(del(name), GET_ITEM_TIMEOUT_MS);
        if (ok === null) removeLocalItem(name);
      } catch {
        removeLocalItem(name);
      }
    },
  };
}

// Resilient storage: IDB with timeout + localStorage fallback + memory cache.
// Mitigates Safari private mode (indexedDB null/hang), bfcache lock, quota limits.
// getItem 必须严格返回 string | null，绝不能将非字符串脏数据传给 Zustand 导致 JSON.parse 崩溃。

import type { StateStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

const GET_ITEM_TIMEOUT_MS = 3000;
const SET_ITEM_TIMEOUT_MS = 5000;
const SAFARI_NULL_PROBE_MS = 500;

const memoryCache = new Map<string, string>();
let idbAvailable: boolean | null = null;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timerId = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([p, timeoutPromise]).finally(() => {
    if (timerId != null) clearTimeout(timerId);
  });
}

/** Lifecycle guard: probe IDB before idb-keyval. Call at app bootstrap to detect Safari private mode early. */
export async function ensureStorageReady(): Promise<void> {
  await probeIdbAvailable();
}

function probeIdbAvailable(): Promise<boolean> {
  if (idbAvailable !== null) return Promise.resolve(idbAvailable);
  if (typeof indexedDB === "undefined" || indexedDB == null) {
    idbAvailable = false;
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      idbAvailable = false;
      resolve(false);
    }, SAFARI_NULL_PROBE_MS);
    try {
      const req = indexedDB.open("__versecraft_probe__");
      if (req == null) {
        clearTimeout(t);
        idbAvailable = false;
        resolve(false);
        return;
      }
      req.onsuccess = () => {
        clearTimeout(t);
        req.result?.close();
        idbAvailable = true;
        resolve(true);
      };
      req.onerror = () => {
        clearTimeout(t);
        idbAvailable = false;
        resolve(false);
      };
      req.onblocked = () => {
        clearTimeout(t);
        idbAvailable = false;
        resolve(false);
      };
    } catch {
      clearTimeout(t);
      idbAvailable = false;
      resolve(false);
    }
  });
}

export function notifyStorageDegraded(message?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("storage-degraded", { detail: { message } }));
  } catch {
    /* ignore */
  }
}

export function resolveStorageFallbackValue(
  idbResult: unknown,
  localValue: string | null,
  memoryValue: string | undefined
): string | null {
  if (typeof idbResult === "string") return idbResult;
  if (typeof localValue === "string") return localValue;
  if (typeof memoryValue === "string") return memoryValue;
  return null;
}

function getLocalItem(name: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(name);
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

function setLocalItem(name: string, value: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(name, value);
    return true;
  } catch {
    return false;
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
      try {
        const canUseIdb = await probeIdbAvailable();
        if (canUseIdb) {
          const idbResult = await withTimeout(get(name), GET_ITEM_TIMEOUT_MS);
          if (idbResult != null && typeof idbResult !== "string") {
            try {
              await withTimeout(del(name), 1000);
            } catch {
              /* ignore */
            }
            notifyStorageDegraded("本地存储数据格式异常，已隔离当前存档缓存");
          }
          const resolved = resolveStorageFallbackValue(idbResult, getLocalItem(name), memoryCache.get(name));
          if (resolved !== null) return resolved;
        }
        const local = getLocalItem(name);
        if (typeof local === "string") return local;
        const mem = memoryCache.get(name);
        return typeof mem === "string" ? mem : null;
      } catch {
        try {
          await withTimeout(del(name), 1000);
        } catch {
          /* ignore */
        }
        notifyStorageDegraded("本地存储读取较慢，已进入临时恢复模式");
        return getLocalItem(name) ?? memoryCache.get(name) ?? null;
      }
    },

    setItem: async (name: string, value: string): Promise<void> => {
      memoryCache.set(name, value);
      try {
        const canUseIdb = await probeIdbAvailable();
        if (canUseIdb) {
          const done = await withTimeout(set(name, value), SET_ITEM_TIMEOUT_MS);
          if (done !== null) return;
        }
        if (setLocalItem(name, value)) return;
      } catch {
        if (setLocalItem(name, value)) return;
      }
      notifyStorageDegraded();
    },

    removeItem: async (name: string): Promise<void> => {
      memoryCache.delete(name);
      try {
        const canUseIdb = await probeIdbAvailable();
        if (canUseIdb) {
          const done = await withTimeout(del(name), GET_ITEM_TIMEOUT_MS);
          if (done !== null) return;
        }
        removeLocalItem(name);
        return;
      } catch {
        removeLocalItem(name);
      }
    },
  };
}

const PERSIST_KEYS = ["versecraft-storage", "versecraft-game-state", "versecraft-achievements"];

/** Clear all VerseCraft persisted data. Use when recovery from corrupted state is needed. */
export async function clearVersecraftStorage(): Promise<void> {
  for (const key of PERSIST_KEYS) {
    memoryCache.delete(key);
    removeLocalItem(key);
    try {
      await withTimeout(del(key), 1000);
    } catch {
      /* ignore */
    }
  }
}

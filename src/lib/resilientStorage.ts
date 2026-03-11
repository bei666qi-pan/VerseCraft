// Resilient storage: IDB with timeout + localStorage fallback.
// Mitigates "stuck loading" when IndexedDB hangs (e.g. mobile Safari private mode).
// getItem 必须严格返回 string | null，绝不能将非字符串脏数据传给 Zustand 导致 JSON.parse 崩溃。

import type { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";

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
    const v = localStorage.getItem(name);
    return typeof v === "string" ? v : null;
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
      try {
        const idbResult = await withTimeout(get(name), GET_ITEM_TIMEOUT_MS);
        // 严格校验：仅接受 string，拒绝 [object Object] 或非字符串脏数据
        if (idbResult != null && typeof idbResult === "string") return idbResult;
        // idb 返回非字符串（旧脏数据）时清空 IDB，避免污染 Zustand
        if (idbResult != null && typeof idbResult !== "string") {
          try {
            await clear();
          } catch {
            /* ignore */
          }
          return null;
        }
        // idb 无数据或超时，尝试 localStorage 回退
        const local = getLocalItem(name);
        return typeof local === "string" ? local : null;
      } catch {
        // 终极兜底：IDB 事务锁死/Safari 隐私模式/解析异常时，清空 IDB 并返回 null，强制 Zustand 使用默认状态
        try {
          await clear();
        } catch {
          /* ignore clear failure */
        }
        try {
          removeLocalItem(name);
        } catch {
          /* ignore */
        }
        return null;
      }
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

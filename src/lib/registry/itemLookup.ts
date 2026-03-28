// src/lib/registry/itemLookup.ts
// 注册表 id → Item（供玩法/服务端逻辑使用）。勿从高频 UI 工具 re-export，以免误拉全表。

import { ITEMS } from "./items";
import type { Item } from "./types";

const ITEM_BY_ID = new Map<string, Item>(ITEMS.map((i) => [i.id, i]));

/** 按标准道具 id 解析注册表条目（行囊 / 结构化回写）。 */
export function findRegisteredItemById(id: string | null | undefined): Item | undefined {
  if (!id || typeof id !== "string") return undefined;
  const k = id.trim();
  if (!k) return undefined;
  return ITEM_BY_ID.get(k);
}

import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import { normalizeClueUpdateArray } from "@/lib/domain/clueMerge";
import { ITEMS } from "@/lib/registry/items";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import type { InfusionState, Item, ItemDomainLayer, StatType, WarehouseItem, Weapon, WeaponModKind } from "@/lib/registry/types";
import { normalizeGameTaskDraft, normalizeTaskUpdateDraft } from "@/lib/tasks/taskV2";
import type { GameTaskStatus, GameTaskV2 } from "@/lib/tasks/taskV2";
import type { AchievementRecord } from "@/store/useAchievementsStore";
import { selectNarrativeGuideFragment } from "./guideContent";

type AssistantLogEntry = { role: "assistant"; content: string; reasoning?: string };

export type NarrativeFeatureTriggerEvent =
  | { type: "guide.hint"; raw: unknown; writeLog?: boolean }
  | { type: "task.panel_hint"; raw: unknown }
  | { type: "task.add"; raw: unknown }
  | { type: "task.update"; raw: unknown }
  | { type: "journal.clue_updates"; raw: unknown; nowIso?: string }
  | { type: "journal.recall"; raw?: unknown; writeLog?: boolean }
  | { type: "inventory.award"; raw: unknown; writeLog?: boolean }
  | { type: "inventory.consume"; raw: unknown; writeLog?: boolean }
  | { type: "inventory.check"; raw?: unknown; writeLog?: boolean }
  | { type: "warehouse.award"; raw: unknown }
  | { type: "warehouse.consume"; raw: unknown; writeLog?: boolean }
  | { type: "warehouse.check"; raw?: unknown; writeLog?: boolean }
  | { type: "warehouse.note"; text: string; writeLog?: boolean }
  | { type: "achievement.unlock"; record: Omit<AchievementRecord, "createdAt"> }
  | { type: "weapon.update"; raw: unknown }
  | { type: "weapon_bag.update"; raw: unknown };

export type NarrativeWeaponUpdate = {
  weaponId?: string;
  weapon?: Weapon | null;
  unequip?: boolean;
  stability?: number;
  calibratedThreatId?: string | null;
  currentMods?: Weapon["currentMods"];
  currentInfusions?: InfusionState[];
  contamination?: number;
  repairable?: boolean;
};

export type NarrativeWeaponBagUpdate =
  | { removeWeaponId: string }
  | { addWeapon: Weapon }
  | { addEquippedWeaponId: string };

export type NarrativeFeatureTriggerDeps = {
  getTasks?: () => Array<Pick<GameTaskV2, "id" | "title">>;
  addTask?: (task: Partial<GameTaskV2> & { id: string; title: string }) => void;
  updateTaskStatus?: (taskId: string, status: GameTaskStatus) => void;
  updateTask?: (taskPatch: { id: string } & Partial<GameTaskV2>) => void;
  getJournalClues?: () => Array<Pick<ClueEntry, "id" | "title">>;
  mergeJournalClueUpdates?: (incoming: ClueEntry[]) => void;
  getInventoryItems?: () => Array<Pick<Item, "id" | "name">>;
  addInventoryItems?: (items: Item[]) => void;
  consumeInventoryItems?: (itemKeys: string[]) => void;
  getWarehouseItems?: () => Array<Pick<WarehouseItem, "id" | "name">>;
  addWarehouseItems?: (items: WarehouseItem[]) => void;
  removeWarehouseItems?: (itemKeys: string[]) => void;
  addAchievementRecord?: (record: Omit<AchievementRecord, "createdAt">) => void;
  applyWeaponUpdates?: (updates: NarrativeWeaponUpdate[]) => void;
  applyWeaponBagUpdates?: (updates: NarrativeWeaponBagUpdate[]) => void;
  pushLog?: (entry: AssistantLogEntry) => void;
};

export type NarrativeFeatureTriggerResult = {
  applied: boolean;
  feature: "guide" | "task" | "journal" | "inventory" | "warehouse" | "achievement" | "weapon";
  hints: string[];
  counts: {
    guideHintsPresented?: number;
    taskAddsApplied?: number;
    taskUpdatesApplied?: number;
    journalCluesMerged?: number;
    journalCluesRead?: number;
    inventoryItemsWritten?: number;
    inventoryItemsConsumed?: number;
    inventoryItemsChecked?: number;
    warehouseItemsWritten?: number;
    warehouseItemsConsumed?: number;
    warehouseItemsChecked?: number;
    achievementsUnlocked?: number;
    weaponUpdatesApplied?: number;
    weaponBagUpdatesApplied?: number;
  };
};

const EMPTY_RESULT: Omit<NarrativeFeatureTriggerResult, "feature"> = {
  applied: false,
  hints: [],
  counts: {},
};

const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
const WAREHOUSE_BY_ID = new Map(WAREHOUSE_ITEMS.map((w) => [w.id, w]));
const ITEM_DOMAIN_LAYERS = new Set<ItemDomainLayer>([
  "key",
  "tool",
  "consumable",
  "evidence",
  "social_token",
  "material",
]);
const WEAPON_MOD_KINDS = new Set<WeaponModKind>([
  "silent",
  "mirror",
  "conductive",
  "anti_pollution",
  "grappling",
  "echo_lure",
]);

function result(
  feature: NarrativeFeatureTriggerResult["feature"],
  patch?: Partial<Omit<NarrativeFeatureTriggerResult, "feature">>
): NarrativeFeatureTriggerResult {
  return {
    feature,
    applied: patch?.applied ?? false,
    hints: patch?.hints ?? [],
    counts: patch?.counts ?? {},
  };
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function cleanText(raw: unknown, max = 140): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function pickItemDomainLayer(v: unknown): ItemDomainLayer | undefined {
  return typeof v === "string" && ITEM_DOMAIN_LAYERS.has(v as ItemDomainLayer) ? (v as ItemDomainLayer) : undefined;
}

function extractGuideHint(raw: unknown): string {
  const o = asRecord(raw);
  if (!o) return "";
  return (
    cleanText(o.guide_hint) ||
    cleanText(o.tutorial_hint) ||
    cleanText(o.scene_hint) ||
    cleanText(o.new_player_guide_hint) ||
    selectNarrativeGuideFragment(raw)
  );
}

function extractJournalRecallHint(
  raw: unknown,
  clues: Array<Pick<ClueEntry, "id" | "title">>
): { hint: string; count: number } {
  const o = asRecord(raw);
  const rawIds = o?.clue_ids ?? o?.clueIds ?? o?.ids;
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];
  const query = cleanText(o?.query, 80);
  const selected = clues.filter((clue) => {
    if (ids.length > 0) return ids.includes(clue.id);
    if (query) return clue.title.includes(query) || clue.id.includes(query);
    return true;
  });
  const titles = selected.map((clue) => cleanText(clue.title, 60)).filter(Boolean);
  if (titles.length === 0) return { hint: "", count: 0 };
  return {
    hint: `手记回顾：${titles.slice(0, 3).join("、")}${titles.length > 3 ? "…" : ""}`,
    count: selected.length,
  };
}

function extractTaskPanelHint(raw: unknown): string {
  const o = asRecord(raw);
  if (!o) return "";
  const autoOpenTask = o.auto_open_panel === "task";
  const highlightIds = Array.isArray(o.highlight_task_ids)
    ? o.highlight_task_ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  return autoOpenTask || highlightIds.length > 0 ? "新的叙事线索已被记录。" : "";
}

function extractItemKeys(raw: unknown): string[] {
  if (typeof raw === "string") {
    const cleaned = cleanText(raw, 100);
    return cleaned ? [cleaned] : [];
  }
  if (Array.isArray(raw)) {
    return raw.map((x) => cleanText(x, 100)).filter(Boolean);
  }
  const o = asRecord(raw);
  if (!o) return [];
  const direct = [o.id, o.name, o.query].map((x) => cleanText(x, 100)).filter(Boolean);
  const arrays = [
    o.ids,
    o.names,
    o.item_ids,
    o.itemIds,
    o.item_names,
    o.itemNames,
    o.warehouse_ids,
    o.warehouseIds,
    o.warehouse_names,
    o.warehouseNames,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map((x) => cleanText(x, 100))
    .filter(Boolean);
  return [...direct, ...arrays];
}

function selectItemsByKeys<T extends { id?: string; name?: string }>(items: T[], keys: string[]): T[] {
  if (keys.length === 0) return items.slice(0, 3);
  return items.filter((item) =>
    keys.some((key) => {
      const normalized = key.trim();
      if (!normalized) return false;
      return item.id === normalized || item.name === normalized || item.name?.includes(normalized);
    })
  );
}

function formatItemNames(items: Array<{ name?: string }>, fallback = "相关物品"): string {
  const names = items.map((item) => cleanText(item.name, 60)).filter(Boolean);
  if (names.length === 0) return fallback;
  return names.slice(0, 3).join("、") + (names.length > 3 ? "…" : "");
}

function normalizeWeaponMods(raw: unknown): WeaponModKind[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const mods = raw.filter((x): x is WeaponModKind => typeof x === "string" && WEAPON_MOD_KINDS.has(x as WeaponModKind));
  return mods.length > 0 ? mods : [];
}

function normalizeInfusions(raw: unknown): InfusionState[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((x): x is Record<string, unknown> => !!asRecord(x))
    .map((x): InfusionState => {
      const threatTag: InfusionState["threatTag"] =
        x.threatTag === "liquid" ||
        x.threatTag === "mirror" ||
        x.threatTag === "cognition" ||
        x.threatTag === "seal"
          ? x.threatTag
          : "liquid";
      return {
        threatTag,
        turnsLeft: typeof x.turnsLeft === "number" && Number.isFinite(x.turnsLeft) ? x.turnsLeft : 0,
      };
    });
}

export function resolveNarrativeWarehouseItems(raw: unknown): WarehouseItem[] {
  const out: WarehouseItem[] = [];
  for (const row of asArray(raw)) {
    if (typeof row === "string" && row.trim()) {
      const found = WAREHOUSE_BY_ID.get(row.trim());
      if (found) out.push(found);
      continue;
    }

    const o = asRecord(row);
    const id = cleanText(o?.id, 80);
    if (!id || !o) continue;
    const found = WAREHOUSE_BY_ID.get(id);
    if (found) {
      out.push(found);
      continue;
    }
    out.push({
      id,
      name: cleanText(o.name, 80) || "未知物品",
      description: cleanText(o.description, 300) || "临时写回物品",
      benefit: cleanText(o.benefit, 220) || "未知",
      sideEffect: cleanText(o.sideEffect, 220) || "未知",
      ownerId: cleanText(o.ownerId, 80) || "N-019",
      floor: "B1",
      isResurrection: typeof o.isResurrection === "boolean" ? o.isResurrection : undefined,
    });
  }
  return out;
}

export function resolveNarrativeInventoryItems(raw: unknown): Item[] {
  const out: Item[] = [];
  const validTiers = new Set<Item["tier"]>(["S", "A", "B", "C", "D"]);
  for (const row of asArray(raw)) {
    if (typeof row === "string" && row.trim()) {
      const found = ITEM_BY_ID.get(row.trim());
      if (found) out.push(found);
      continue;
    }

    const o = asRecord(row);
    const id = cleanText(o?.id, 80);
    if (!id || !o) continue;
    const found = ITEM_BY_ID.get(id);
    if (found) {
      out.push(found);
      continue;
    }
    const tier = validTiers.has(o.tier as Item["tier"]) ? (o.tier as Item["tier"]) : "B";
    const rawStatBonus = asRecord(o.statBonus);
    let statBonus: Item["statBonus"];
    if (rawStatBonus) {
      const entries = Object.entries(rawStatBonus).filter(([, v]) => typeof v === "number" && Number.isFinite(v)) as [StatType, number][];
      if (entries.length > 0) statBonus = Object.fromEntries(entries) as Item["statBonus"];
    }
    const layer = pickItemDomainLayer(o.domainLayer);
    out.push({
      id,
      name: cleanText(o.name, 80) || "未知道具",
      tier,
      description: cleanText(o.description, 300) || "临时写回道具",
      tags: cleanText(o.tags, 140) || "narrative",
      ownerId: cleanText(o.ownerId, 80) || "N-019",
      statBonus,
      ...(layer ? { domainLayer: layer } : {}),
    });
  }
  return out;
}

function normalizeWeaponUpdates(raw: unknown): NarrativeWeaponUpdate[] {
  return asArray(raw)
    .filter((x): x is Record<string, unknown> => !!asRecord(x))
    .map((u) => ({
      weaponId: cleanText(u.weaponId, 80) || undefined,
      weapon:
        u.weapon && typeof u.weapon === "object" && !Array.isArray(u.weapon)
          ? (u.weapon as Weapon)
          : u.weapon === null
            ? null
            : undefined,
      unequip: typeof u.unequip === "boolean" ? u.unequip : undefined,
      stability: typeof u.stability === "number" && Number.isFinite(u.stability) ? u.stability : undefined,
      calibratedThreatId:
        u.calibratedThreatId === null || typeof u.calibratedThreatId === "string"
          ? (u.calibratedThreatId as string | null)
          : undefined,
      currentMods: normalizeWeaponMods(u.currentMods),
      currentInfusions: normalizeInfusions(u.currentInfusions),
      contamination: typeof u.contamination === "number" && Number.isFinite(u.contamination) ? u.contamination : undefined,
      repairable: typeof u.repairable === "boolean" ? u.repairable : undefined,
    }))
    .filter((u) => Object.values(u).some((v) => v !== undefined));
}

function normalizeWeaponBagUpdates(raw: unknown): NarrativeWeaponBagUpdate[] {
  return asArray(raw)
    .filter((x): x is Record<string, unknown> => !!asRecord(x))
    .map((u): NarrativeWeaponBagUpdate | null => {
      const removeWeaponId = cleanText(u.removeWeaponId, 80);
      if (removeWeaponId) return { removeWeaponId };
      if (u.addWeapon && typeof u.addWeapon === "object" && !Array.isArray(u.addWeapon)) {
        return { addWeapon: u.addWeapon as Weapon };
      }
      const addEquippedWeaponId = cleanText(u.addEquippedWeaponId, 80);
      if (addEquippedWeaponId) return { addEquippedWeaponId };
      return null;
    })
    .filter((x): x is NarrativeWeaponBagUpdate => !!x);
}

export function applyNarrativeFeatureEvent(
  event: NarrativeFeatureTriggerEvent,
  deps: NarrativeFeatureTriggerDeps
): NarrativeFeatureTriggerResult {
  switch (event.type) {
    case "guide.hint": {
      const hint = extractGuideHint(event.raw);
      if (!hint) return result("guide", EMPTY_RESULT);
      if (event.writeLog) {
        deps.pushLog?.({ role: "assistant", content: `**场景提示**：${hint}`, reasoning: undefined });
      }
      return result("guide", {
        applied: true,
        hints: [hint],
        counts: { guideHintsPresented: 1 },
      });
    }
    case "task.panel_hint": {
      const hint = extractTaskPanelHint(event.raw);
      return result("task", {
        applied: Boolean(hint),
        hints: hint ? [hint] : [],
      });
    }
    case "task.add": {
      const rows = asArray(event.raw)
        .map((x) => normalizeGameTaskDraft(x))
        .filter((x): x is GameTaskV2 => !!x);
      if (rows.length === 0 || !deps.addTask) return result("task", EMPTY_RESULT);
      const beforeIds = new Set((deps.getTasks?.() ?? []).map((t) => t.id));
      for (const task of rows) deps.addTask(task);
      const after = deps.getTasks?.() ?? rows;
      const added = after.filter((t) => !beforeIds.has(t.id));
      return result("task", {
        applied: rows.length > 0,
        hints: added.length > 0 ? ["新的叙事线索已被记录。"] : [],
        counts: { taskAddsApplied: rows.length },
      });
    }
    case "task.update": {
      const patches = asArray(event.raw)
        .map((x) => normalizeTaskUpdateDraft(x))
        .filter((x): x is { id: string } & Partial<GameTaskV2> => !!x);
      if (patches.length === 0) return result("task", EMPTY_RESULT);
      for (const patch of patches) {
        if (patch.status) deps.updateTaskStatus?.(patch.id, patch.status);
        deps.updateTask?.(patch);
      }
      return result("task", {
        applied: true,
        counts: { taskUpdatesApplied: patches.length },
      });
    }
    case "journal.clue_updates": {
      const rows = normalizeClueUpdateArray(event.raw, event.nowIso ?? new Date().toISOString());
      if (rows.length === 0 || !deps.mergeJournalClueUpdates) return result("journal", EMPTY_RESULT);
      const beforeIds = new Set((deps.getJournalClues?.() ?? []).map((c) => c.id));
      deps.mergeJournalClueUpdates(rows);
      const freshTitles = rows.filter((c) => c.id && !beforeIds.has(c.id)).map((c) => c.title);
      return result("journal", {
        applied: true,
        hints:
          freshTitles.length > 0
            ? [`手记更新：${freshTitles.slice(0, 2).join("、")}${freshTitles.length > 2 ? "…" : ""}`]
            : [],
        counts: { journalCluesMerged: rows.length },
      });
    }
    case "journal.recall": {
      const { hint, count } = extractJournalRecallHint(event.raw, deps.getJournalClues?.() ?? []);
      if (!hint) return result("journal", EMPTY_RESULT);
      if (event.writeLog) {
        deps.pushLog?.({ role: "assistant", content: `**场景回忆**：${hint}`, reasoning: undefined });
      }
      return result("journal", {
        applied: true,
        hints: [hint],
        counts: { journalCluesRead: count },
      });
    }
    case "inventory.award": {
      const items = resolveNarrativeInventoryItems(event.raw);
      if (items.length === 0 || !deps.addInventoryItems) return result("inventory", EMPTY_RESULT);
      const beforeIds = new Set((deps.getInventoryItems?.() ?? []).map((item) => item.id));
      deps.addInventoryItems(items);
      const afterIds = new Set((deps.getInventoryItems?.() ?? items).map((item) => item.id));
      const written = items.map((item) => item.id).filter((id) => !!id && afterIds.has(id));
      const firstNew = items.find((item) => !beforeIds.has(item.id));
      if (written.length > 0 && event.writeLog) {
        deps.pushLog?.({ role: "assistant", content: "**获得了新道具，已放入行囊**", reasoning: undefined });
      }
      return result("inventory", {
        applied: written.length > 0,
        hints: firstNew ? [`你记下了新道具【${firstNew.name}】。`] : [],
        counts: { inventoryItemsWritten: written.length },
      });
    }
    case "inventory.consume": {
      const keys = extractItemKeys(event.raw);
      const before = deps.getInventoryItems?.() ?? [];
      const matched = selectItemsByKeys(before, keys);
      if (keys.length === 0 || matched.length === 0 || !deps.consumeInventoryItems) return result("inventory", EMPTY_RESULT);
      deps.consumeInventoryItems(keys);
      const hint = `已消耗道具：${formatItemNames(matched)}。`;
      if (event.writeLog) deps.pushLog?.({ role: "assistant", content: `**行囊记录**：${hint}`, reasoning: undefined });
      return result("inventory", {
        applied: true,
        hints: [hint],
        counts: { inventoryItemsConsumed: matched.length },
      });
    }
    case "inventory.check": {
      const items = deps.getInventoryItems?.() ?? [];
      const matched = selectItemsByKeys(items, extractItemKeys(event.raw));
      if (matched.length === 0) return result("inventory", EMPTY_RESULT);
      const hint = `你摸到包里还有：${formatItemNames(matched)}。`;
      if (event.writeLog) deps.pushLog?.({ role: "assistant", content: `**行囊确认**：${hint}`, reasoning: undefined });
      return result("inventory", {
        applied: true,
        hints: [hint],
        counts: { inventoryItemsChecked: matched.length },
      });
    }
    case "warehouse.award": {
      const items = resolveNarrativeWarehouseItems(event.raw);
      if (items.length === 0 || !deps.addWarehouseItems) return result("warehouse", EMPTY_RESULT);
      const beforeIds = new Set((deps.getWarehouseItems?.() ?? []).map((w) => w.id));
      deps.addWarehouseItems(items);
      const afterIds = new Set((deps.getWarehouseItems?.() ?? items).map((w) => w.id));
      const written = items.map((w) => w.id).filter((id) => !!id && afterIds.has(id));
      const firstNew = items.find((w) => !beforeIds.has(w.id));
      if (written.length > 0) {
        deps.pushLog?.({ role: "assistant", content: "**获得了新物品，已收入仓库**", reasoning: undefined });
      }
      return result("warehouse", {
        applied: written.length > 0,
        hints: firstNew ? [`你在仓库中发现了新物品「${firstNew.name}」。`] : [],
        counts: { warehouseItemsWritten: written.length },
      });
    }
    case "warehouse.consume": {
      const keys = extractItemKeys(event.raw);
      const before = deps.getWarehouseItems?.() ?? [];
      const matched = selectItemsByKeys(before, keys);
      if (keys.length === 0 || matched.length === 0 || !deps.removeWarehouseItems) return result("warehouse", EMPTY_RESULT);
      deps.removeWarehouseItems(keys);
      const hint = `仓库支出：${formatItemNames(matched)}。`;
      if (event.writeLog) deps.pushLog?.({ role: "assistant", content: `**仓库记录**：${hint}`, reasoning: undefined });
      return result("warehouse", {
        applied: true,
        hints: [hint],
        counts: { warehouseItemsConsumed: matched.length },
      });
    }
    case "warehouse.check": {
      const items = deps.getWarehouseItems?.() ?? [];
      const matched = selectItemsByKeys(items, extractItemKeys(event.raw));
      if (matched.length === 0) return result("warehouse", EMPTY_RESULT);
      const hint = `仓库记录里还有：${formatItemNames(matched)}。`;
      if (event.writeLog) deps.pushLog?.({ role: "assistant", content: `**仓库确认**：${hint}`, reasoning: undefined });
      return result("warehouse", {
        applied: true,
        hints: [hint],
        counts: { warehouseItemsChecked: matched.length },
      });
    }
    case "warehouse.note": {
      const text = cleanText(event.text, 180);
      if (!text) return result("warehouse", EMPTY_RESULT);
      if (event.writeLog) {
        deps.pushLog?.({ role: "assistant", content: `**仓库记录**：${text}`, reasoning: undefined });
      }
      return result("warehouse", { applied: true, hints: [text] });
    }
    case "achievement.unlock": {
      deps.addAchievementRecord?.(event.record);
      return result("achievement", {
        applied: Boolean(deps.addAchievementRecord),
        counts: { achievementsUnlocked: deps.addAchievementRecord ? 1 : 0 },
      });
    }
    case "weapon.update": {
      const updates = normalizeWeaponUpdates(event.raw);
      if (updates.length > 0) deps.applyWeaponUpdates?.(updates);
      return result("weapon", {
        applied: updates.length > 0 && Boolean(deps.applyWeaponUpdates),
        counts: { weaponUpdatesApplied: updates.length },
      });
    }
    case "weapon_bag.update": {
      const updates = normalizeWeaponBagUpdates(event.raw);
      if (updates.length > 0) deps.applyWeaponBagUpdates?.(updates);
      return result("weapon", {
        applied: updates.length > 0 && Boolean(deps.applyWeaponBagUpdates),
        counts: { weaponBagUpdatesApplied: updates.length },
      });
    }
  }
}

export function applyNarrativeFeatureEvents(
  events: NarrativeFeatureTriggerEvent[],
  deps: NarrativeFeatureTriggerDeps
): NarrativeFeatureTriggerResult[] {
  return events.map((event) => applyNarrativeFeatureEvent(event, deps));
}

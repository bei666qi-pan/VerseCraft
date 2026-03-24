import { FORGE_CATALOG_MINIMAL, SHOP_CATALOG_MINIMAL } from "@/lib/registry/serviceNodes";
import { guessPlayerLocationFromContext } from "./b1Safety";

type DmRecord = Record<string, unknown>;

function parseOriginiumFromPlayerContext(playerContext: string): number {
  const m = playerContext.match(/原石\[(\-?\d+)\]/);
  const v = Number(m?.[1] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function parseInventoryItemIds(playerContext: string): string[] {
  const m = playerContext.match(/行囊道具：([^。]+)/);
  const segment = m?.[1] ?? "";
  const out = new Set<string>();
  for (const hit of segment.matchAll(/\[([A-Z]-[A-Z]\d{2})\|[A-Z]\]/g)) {
    if (hit[1]) out.add(hit[1]);
  }
  return [...out];
}

function appendArrayField(record: DmRecord, field: string, values: string[]) {
  const prev = Array.isArray(record[field])
    ? (record[field] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  record[field] = [...new Set([...prev, ...values])];
}

function addNarrativeLine(record: DmRecord, line: string) {
  const n = typeof record.narrative === "string" ? record.narrative : "";
  record.narrative = n ? `${n}\n\n${line}` : line;
}

function sumCurrencyChange(record: DmRecord, delta: number) {
  const prev = Number(record.currency_change ?? 0);
  const base = Number.isFinite(prev) ? prev : 0;
  record.currency_change = base + delta;
}

function applyShopAction(record: DmRecord, actionText: string, originium: number): boolean {
  if (!actionText.includes("购买")) return false;
  const itemId = [...actionText.matchAll(/\b(I-[A-Z]\d{2})\b/g)][0]?.[1];
  if (!itemId) return false;
  const shopItem = SHOP_CATALOG_MINIMAL.find((x) => x.itemId === itemId);
  if (!shopItem) {
    record.is_action_legal = false;
    addNarrativeLine(record, "你试图购买未上架的物品，储物间商店拒绝了这笔交易。");
    return true;
  }
  if (originium < shopItem.priceOriginium) {
    record.is_action_legal = false;
    addNarrativeLine(record, "原石不足，这次交易没有成功。");
    return true;
  }
  appendArrayField(record, "awarded_items", [shopItem.itemId]);
  sumCurrencyChange(record, -shopItem.priceOriginium);
  addNarrativeLine(record, `你完成了交易，获得 ${shopItem.itemId}。`);
  return true;
}

function applyForgeAction(
  record: DmRecord,
  actionText: string,
  originium: number,
  inventoryIds: string[]
): boolean {
  const mentionsForge =
    actionText.includes("锻造") || actionText.includes("合成") || actionText.includes("修复");
  if (!mentionsForge) return false;
  const recipeId = [...actionText.matchAll(/\b(forge_[a-z0-9_]+)\b/gi)][0]?.[1];
  if (!recipeId) return false;
  const recipe = FORGE_CATALOG_MINIMAL.find((x) => x.id === recipeId);
  if (!recipe) {
    record.is_action_legal = false;
    addNarrativeLine(record, "配方不存在，配电间的锻造台没有响应。");
    return true;
  }
  const missing = recipe.inputItemIds.filter((id) => !inventoryIds.includes(id));
  if (missing.length > 0) {
    record.is_action_legal = false;
    addNarrativeLine(record, `材料不足，缺少：${missing.join("、")}。`);
    return true;
  }
  if (originium < recipe.costOriginium) {
    record.is_action_legal = false;
    addNarrativeLine(record, "原石不足，锻造过程被中止。");
    return true;
  }
  appendArrayField(record, "consumed_items", recipe.inputItemIds);
  appendArrayField(record, "awarded_items", [recipe.outputItemId]);
  sumCurrencyChange(record, -recipe.costOriginium);
  addNarrativeLine(record, `锻造完成，产出 ${recipe.outputItemId}。`);
  return true;
}

/**
 * Stage-1 minimal service execution guard:
 * - B1_Storage shop buy
 * - B1_PowerRoom forge recipe
 * Keeps SSE/DM JSON contract intact by mutating normalized dmRecord fields only.
 */
export function applyB1ServiceExecutionGuard(args: {
  dmRecord: DmRecord;
  latestUserInput: string;
  playerContext: string;
}): DmRecord {
  const record = { ...args.dmRecord };
  const location =
    (typeof record.player_location === "string" ? record.player_location : null) ??
    guessPlayerLocationFromContext(args.playerContext);
  if (!location) return record;
  const actionText = String(args.latestUserInput ?? "").trim();
  if (!actionText) return record;

  const originium = parseOriginiumFromPlayerContext(args.playerContext);
  const inventoryIds = parseInventoryItemIds(args.playerContext);

  let handled = false;
  if (location === "B1_Storage") {
    handled = applyShopAction(record, actionText, originium);
  } else if (location === "B1_PowerRoom") {
    handled = applyForgeAction(record, actionText, originium, inventoryIds);
  }
  if (!handled) return record;

  const meta =
    record.security_meta && typeof record.security_meta === "object" && !Array.isArray(record.security_meta)
      ? (record.security_meta as Record<string, unknown>)
      : {};
  record.security_meta = {
    ...meta,
    service_guard: "b1_minimal_execution",
  };
  return record;
}

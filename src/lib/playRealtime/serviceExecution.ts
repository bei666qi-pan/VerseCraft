import { FORGE_CATALOG_MINIMAL, SHOP_CATALOG_MINIMAL, getServicesForLocation } from "@/lib/registry/serviceNodes";
import { getWeaponById } from "@/lib/registry/weapons";
import { buildLightForgePreview, executeLightForge } from "./forgeService";
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

function parseWarehouseItemIds(playerContext: string): string[] {
  const m = playerContext.match(/仓库物品：([^。]+)/);
  const segment = m?.[1] ?? "";
  const out = new Set<string>();
  for (const hit of segment.matchAll(/\[([A-Z]-[A-Z]\d{2,3})]/g)) {
    if (hit[1]) out.add(hit[1]);
  }
  return [...out];
}

function parseNpcIdsAtLocation(playerContext: string, location: string): string[] {
  const m = playerContext.match(/NPC当前位置：([^。]+)/);
  const seg = m?.[1] ?? "";
  if (!seg) return [];
  return seg
    .split("，")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.split("@"))
    .filter((x) => (x[1] ?? "").trim() === location)
    .map((x) => (x[0] ?? "").trim())
    .filter(Boolean);
}

function parseEquippedWeaponFromPlayerContext(playerContext: string): {
  weaponId: string | null;
  stability: number | null;
  mods: string[];
  infusions: Array<{ threatTag: "liquid" | "mirror" | "cognition" | "seal"; turnsLeft: number }>;
  contamination: number;
  repairable: boolean;
} {
  const m = playerContext.match(/主手武器\[([^\]|]+)\|稳定(\d+)\|反制([^|\]]*)(?:\|模组([^|\]]*))?(?:\|灌注([^|\]]*))?(?:\|污染(\d+))?(?:\|可修复([01]))?\]/);
  if (!m) return { weaponId: null, stability: null, mods: [], infusions: [], contamination: 0, repairable: true };
  const weaponId = (m[1] ?? "").trim() || null;
  const stability = Number(m[2] ?? "0");
  const mods = (m[4] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => x !== "无");
  const infusions = (m[5] ?? "")
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x.includes(":"))
    .map((x) => {
      const [threatTag, turnsLeft] = x.split(":");
      return { threatTag: threatTag as "liquid" | "mirror" | "cognition" | "seal", turnsLeft: Number(turnsLeft ?? "0") || 0 };
    });
  const contamination = Number(m[6] ?? "0");
  const repairable = m[7] === "0" ? false : true;
  return {
    weaponId,
    stability: Number.isFinite(stability) ? Math.max(0, Math.min(100, Math.trunc(stability))) : null,
    mods,
    infusions,
    contamination: Number.isFinite(contamination) ? Math.max(0, Math.min(100, Math.trunc(contamination))) : 0,
    repairable,
  };
}

function appendArrayField(record: DmRecord, field: string, values: string[]) {
  const prev = Array.isArray(record[field])
    ? (record[field] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  record[field] = [...new Set([...prev, ...values])];
}

function appendObjectArrayField(record: DmRecord, field: string, values: Array<Record<string, unknown>>) {
  const prev = Array.isArray(record[field])
    ? (record[field] as unknown[]).filter(
        (x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)
      )
    : [];
  record[field] = [...prev, ...values];
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

function applyLightForgeWeaponAction(args: {
  record: DmRecord;
  actionText: string;
  originium: number;
  inventoryIds: string[];
  warehouseIds: string[];
  equippedWeapon: ReturnType<typeof parseEquippedWeaponFromPlayerContext>;
}): boolean {
  const text = args.actionText;
  const mentionsPreview = text.includes("查看锻造") || text.includes("锻造台") || text.includes("整备");
  const mentionsForgeAction =
    text.includes("修复") || text.includes("维护") || text.includes("改装") || text.includes("灌注") ||
    text.toLowerCase().includes("repair") || text.toLowerCase().includes("mod") || text.toLowerCase().includes("infuse");
  if (!mentionsPreview && !mentionsForgeAction) return false;
  if (mentionsPreview && !mentionsForgeAction) {
    const preview = buildLightForgePreview({
      weapon: args.equippedWeapon,
      inventoryIds: args.inventoryIds,
      warehouseIds: args.warehouseIds,
    });
    addNarrativeLine(args.record, `你检查了配电间锻造台：${preview}`);
    args.record.options = [
      "执行修复（forge_repair_basic）",
      "执行静音改装（forge_mod_silent）",
      "执行镜像灌注（forge_infuse_mirror）",
      "返回储物间补材料",
    ];
    return true;
  }
  const weaponIdFromText = [...text.matchAll(/\b(WPN-\d{3})\b/g)][0]?.[1] ?? null;
  const weaponId = weaponIdFromText ?? args.equippedWeapon.weaponId;
  const weapon = (() => {
    if (!weaponId) return null;
    const base = getWeaponById(weaponId);
    if (!base) return null;
    return {
      ...base,
      stability: args.equippedWeapon.stability ?? base.stability,
      currentMods: (args.equippedWeapon.mods as typeof base.currentMods) ?? base.currentMods,
      currentInfusions: args.equippedWeapon.infusions ?? base.currentInfusions,
      contamination: args.equippedWeapon.contamination,
      repairable: args.equippedWeapon.repairable,
    };
  })();
  const result = executeLightForge({
    actionText: text,
    originium: args.originium,
    inventoryIds: args.inventoryIds,
    warehouseIds: args.warehouseIds,
    weapon,
  });
  if (!result) return false;
  if (!result.ok) {
    args.record.is_action_legal = false;
    addNarrativeLine(args.record, result.narrative);
    return true;
  }
  if (result.consumedItemIds.length > 0) appendArrayField(args.record, "consumed_items", result.consumedItemIds);
  if (result.consumedWarehouseIds.length > 0) appendArrayField(args.record, "consumed_items", result.consumedWarehouseIds);
  if (result.currencyChange !== 0) sumCurrencyChange(args.record, result.currencyChange);
  if (result.weaponUpdates.length > 0) appendObjectArrayField(args.record, "weapon_updates", result.weaponUpdates as Array<Record<string, unknown>>);
  addNarrativeLine(args.record, result.narrative);
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
  const warehouseIds = parseWarehouseItemIds(args.playerContext);
  const equippedWeapon = parseEquippedWeaponFromPlayerContext(args.playerContext);
  const presentNpcIds = parseNpcIdsAtLocation(args.playerContext, location);

  let handled = false;
  if (location === "B1_Storage") {
    handled = applyShopAction(record, actionText, originium);
  } else if (location === "B1_PowerRoom") {
    const forgeServices = getServicesForLocation(location, { forgeUnlocked: true }).filter(
      (x) => (x.kind === "forge_upgrade" || x.kind === "forge_repair") && x.available
    );
    const npcGatePassed = forgeServices.some((svc) => svc.npcIds.some((id) => presentNpcIds.includes(id)));
    if (!npcGatePassed) {
      record.is_action_legal = false;
      addNarrativeLine(record, "配电间锻造服务当前无人值守，无法执行操作。");
      handled = true;
    } else {
    handled =
      applyLightForgeWeaponAction({
        record,
        actionText,
        originium,
        inventoryIds,
        warehouseIds,
        equippedWeapon,
      }) || applyForgeAction(record, actionText, originium, inventoryIds);
    }
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

import { FORGE_CATALOG_MINIMAL, SHOP_CATALOG_MINIMAL, getServicesForLocation } from "@/lib/registry/serviceNodes";
import { getWeaponById } from "@/lib/registry/weapons";
import { buildLightForgePreview, executeLightForge } from "./forgeService";
import { guessPlayerLocationFromContext } from "./b1Safety";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

type DmRecord = Record<string, unknown>;

function clearEconomyWritebackFields(record: DmRecord) {
  // 强守卫：当本回合由“服务守卫”接管（商店/锻造/武器化/维护/改装/灌注等），
  // 禁止模型夹带私货（白送道具/白送原石/伪造已装备/绕过消耗）。
  record.consumed_items = [];
  record.awarded_items = [];
  record.awarded_warehouse_items = [];
  record.currency_change = 0;
  record.weapon_updates = [];
  record.weapon_bag_updates = [];
}

type WeaponizeDiscountContext = {
  location: string;
  presentNpcIds: string[];
  worldFlags: string[];
  profession: string | null;
};

function computeWeaponizeFinalCost(args: {
  baseCost: number;
  ctx: WeaponizeDiscountContext;
}): { finalCost: number; applied: boolean; reasonCodes: string[] } {
  const base = Math.max(0, Math.trunc(args.baseCost));
  const codes: string[] = [];
  let discount = 0;

  // 结构化折扣策略（只依赖可解析/可审计信号，不允许模型“随口免费”）：
  // - profession: 溯源师（锻造偏好） -10%
  // - service privilege: worldFlags 中包含 forge.privileged -20%
  // - npc relationship: 在场 NPC 满足关系阈值（未来 playerContext 需能精确提供该 NPC 好感）
  if (args.ctx.profession === "溯源师") {
    discount += Math.floor(base * 0.1);
    codes.push("discount.profession.traceorigin");
  }
  if (args.ctx.worldFlags.includes("forge.privileged")) {
    discount += Math.floor(base * 0.2);
    codes.push("discount.service.privileged");
  }

  // 关系折扣（暂不启用）：需要“结构化关系快照”才能做到真正可信。
  // 当前版本仅保留 profession/worldFlags 等可审计来源，避免靠 playerContext 文本推断好感从而被伪造。

  // 任务完成折扣（结构化）：通过 worldFlags 触发（由任务完成/服务解锁写入）。
  if (args.ctx.worldFlags.includes("task.forge_discount_v1")) {
    discount += Math.floor(base * 0.1);
    codes.push("discount.task.flag:task.forge_discount_v1");
  }

  // 上限：最多打 5 折，且至少支付 1（避免“0 元武器化”）
  const maxDiscount = Math.floor(base * 0.5);
  const safeDiscount = Math.max(0, Math.min(maxDiscount, discount));
  const final = Math.max(1, base - safeDiscount);
  return { finalCost: final, applied: safeDiscount > 0, reasonCodes: codes };
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

function applyForgeStateAudit(args: {
  record: DmRecord;
  actionText: string;
  originium: number;
  equippedWeapon: { weaponId: string | null; stability: number | null; contamination: number; raw: Record<string, unknown> | null };
  weaponBagCount: number;
  inventoryMaterialCount: number;
  warehouseMaterialCount: number;
}): boolean {
  if (!/(核对|检查|查看)/.test(args.actionText)) return false;
  if (/(报价|锻造台|整备)/.test(args.actionText)) return false;
  if (/(修复|维护|改装|灌注|武器化|执行)/.test(args.actionText)) return false;
  const weaponName = typeof args.equippedWeapon.raw?.name === "string"
    ? args.equippedWeapon.raw.name
    : args.equippedWeapon.weaponId;
  clearEconomyWritebackFields(args.record);
  args.record.consumes_time = false;
  args.record.narrative = weaponName
    ? `我核对了随身状态：当前装备“${weaponName}”，稳定度 ${args.equippedWeapon.stability ?? "未知"}，污染 ${args.equippedWeapon.contamination}；武器袋共 ${args.weaponBagCount} 把，原石 ${args.originium} 颗。行囊与仓库中共有 ${args.inventoryMaterialCount + args.warehouseMaterialCount} 份可供锻造台校验的现有材料。`
    : `我核对了随身状态：当前没有装备主手武器，武器袋共 ${args.weaponBagCount} 把，原石 ${args.originium} 颗。`;
  return true;
}

function sumCurrencyChange(record: DmRecord, delta: number) {
  const prev = Number(record.currency_change ?? 0);
  const base = Number.isFinite(prev) ? prev : 0;
  record.currency_change = base + delta;
}

function applyShopAction(record: DmRecord, actionText: string, originium: number): boolean {
  if (!actionText.includes("购买")) return false;
  // 商店交易必须系统裁决：先清空经济字段，避免模型写入任何奖励/扣费。
  clearEconomyWritebackFields(record);
  // 交易动作（成功/失败）都消耗回合，防止刷商店探价/刷叙事不耗时。
  record.consumes_time = true;
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
  // 锻造必须系统裁决：先清空经济字段，避免模型写入任何奖励/扣费。
  clearEconomyWritebackFields(record);
  // 锻造动作（成功/失败）都消耗回合；仅“查看/预览”应不耗时（由另一分支处理）。
  record.consumes_time = true;
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
  equippedWeapon: { weaponId: string | null; stability: number | null; mods: string[]; infusions: any[]; contamination: number; repairable: boolean; raw: Record<string, unknown> | null };
  stats: Record<string, number>;
  location: string;
  presentNpcIds: string[];
  worldFlags: string[];
  profession: string | null;
  weaponSlotEmpty: boolean;
}): boolean {
  const text = args.actionText;
  const mentionsPreview =
    text.includes("查看锻造") || text.includes("锻造台") || text.includes("整备") || text.includes("报价") ||
    (text.includes("检查") && /武器|WPN-/.test(text));
  const mentionsForgeAction =
    text.includes("修复") || text.includes("维护") || text.includes("改装") || text.includes("灌注") ||
    text.includes("武器化") ||
    text.toLowerCase().includes("repair") || text.toLowerCase().includes("mod") || text.toLowerCase().includes("infuse") || text.toLowerCase().includes("weaponize");
  if (!mentionsPreview && !mentionsForgeAction) return false;
  if (mentionsPreview && !mentionsForgeAction) {
    // 预览不改经济字段，不消耗回合
    clearEconomyWritebackFields(args.record);
    args.record.consumes_time = false;
    const preview = buildLightForgePreview({
      weapon: args.equippedWeapon,
      inventoryIds: args.inventoryIds,
      warehouseIds: args.warehouseIds,
      stats: args.stats,
    });
    const repairAvailable = preview.includes("forge_repair_basic") && preview.includes("forge_repair_basic[repair|耗原石1|需insulation|可执行]");
    args.record.narrative = args.equippedWeapon.weaponId
      ? `我在配电间锻造台前完成了现有武器检查：当前稳定度为 ${args.equippedWeapon.stability ?? "未知"}；基础维护需要 1 颗原石和绝缘材料，${repairAvailable ? "现有材料满足，可以执行" : "现有材料不足，暂时不能执行"}。其他改装与灌注需要分别核对材料，不会在本次报价中自动生效。`
      : "我在配电间锻造台前查看了服务条件，但当前没有装备主手武器；只能先整理材料或选择对已有道具进行武器化。";
    args.record.options = [
      "执行修复（forge_repair_basic）",
      "执行静音改装（forge_mod_silent）",
      "执行镜像灌注（forge_infuse_mirror）",
      "道具武器化（C）（forge_weaponize_c）",
      "返回储物间补材料",
    ];
    return true;
  }
  // 执行类锻造/武器化：必须系统裁决（清空经济字段，禁止模型夹带奖励/扣费/装备伪造）。
  clearEconomyWritebackFields(args.record);
  // The model's candidate prose may invent a different price or claim a
  // transaction succeeded/failed before this deterministic guard rules on
  // it. Execution turns therefore replace, rather than append to, candidate
  // service prose so narrative and authoritative deltas cannot contradict.
  args.record.narrative = "";
  args.record.consumes_time = true;
  const weaponIdFromText = [...text.matchAll(/\b(WPN-\d{3})\b/g)][0]?.[1] ?? null;
  const weaponId = weaponIdFromText ?? args.equippedWeapon.weaponId;
  const weapon = (() => {
    if (!weaponId) return null;
    const base = getWeaponById(weaponId);
    // World-authored weapons are authoritative state objects but are not
    // necessarily members of the legacy fixed WEAPONS registry. Rejecting
    // them here made an actually equipped weapon appear absent during forge.
    // Build the minimal Weapon contract only from the supplied equipped
    // object; never invent a weapon when the slot is empty.
    const supplied = args.equippedWeapon.raw;
    if (!base && !supplied) return null;
    const fallback = supplied
      ? {
          id: weaponId,
          name: typeof supplied.name === "string" ? supplied.name : weaponId,
          description: typeof supplied.description === "string" ? supplied.description : "世界内已有武器。",
          counterThreatIds: Array.isArray(supplied.counterThreatIds) ? supplied.counterThreatIds.filter((x): x is string => typeof x === "string") : [],
          counterTags: Array.isArray(supplied.counterTags) ? supplied.counterTags.filter((x): x is string => typeof x === "string") : [],
          stability: args.equippedWeapon.stability ?? 60,
          modSlots: Array.isArray(supplied.modSlots) ? supplied.modSlots : ["core", "surface"],
          currentMods: args.equippedWeapon.mods,
          currentInfusions: args.equippedWeapon.infusions,
          contamination: args.equippedWeapon.contamination,
          repairable: args.equippedWeapon.repairable,
        }
      : null;
    const source = base ?? fallback;
    if (!source) return null;
    return {
      ...source,
      stability: args.equippedWeapon.stability ?? source.stability,
      currentMods: (args.equippedWeapon.mods as typeof source.currentMods) ?? source.currentMods,
      currentInfusions: args.equippedWeapon.infusions ?? source.currentInfusions,
      contamination: args.equippedWeapon.contamination,
      repairable: args.equippedWeapon.repairable,
    };
  })();

  // 结构化折扣：仅由 guard 计算并传入执行器；执行器会做越界校验防伪造“免费”。
  const worldFlags = args.worldFlags;
  const profession = args.profession;

  // 基础费用由配方决定；这里先按 actionText 匹配配方 id 决定 baseCost。
  //（executeLightForge 内部会再次对齐 strict base cost）
  const baseCost =
    text.includes("forge_weaponize_s") ? 50 :
    text.includes("forge_weaponize_a") ? 20 :
    text.includes("forge_weaponize_b") ? 10 :
    text.includes("forge_weaponize_c") ? 5 : 0;
  const pricing = baseCost > 0
    ? (() => {
        const disc = computeWeaponizeFinalCost({
          baseCost,
          ctx: {
            location: args.location,
            presentNpcIds: args.presentNpcIds,
            worldFlags,
            profession,
          },
        });
        return {
          baseCostOriginium: baseCost,
          finalCostOriginium: disc.finalCost,
          discountApplied: disc.applied,
          discountReasonCodes: disc.reasonCodes,
        };
      })()
    : undefined;

  const result = executeLightForge({
    actionText: text,
    originium: args.originium,
    inventoryIds: args.inventoryIds,
    warehouseIds: args.warehouseIds,
    weapon,
    stats: args.stats,
    weaponSlotEmpty: args.weaponSlotEmpty,
    weaponizePricing: pricing,
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
  args.record.narrative = result.narrative.replace(/^你/, "我");
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
  clientState: ClientStructuredContextV1 | null;
}): DmRecord {
  const record = { ...args.dmRecord };
  const structuredLoc = args.clientState?.playerLocation ?? null;
  const fallbackLoc =
    (typeof record.player_location === "string" ? record.player_location : null) ??
    guessPlayerLocationFromContext(args.playerContext);
  const location = structuredLoc || fallbackLoc;
  if (!location) return record;
  const actionText = String(args.latestUserInput ?? "").trim();
  if (!actionText) return record;

  const originium = Math.max(0, Math.trunc(args.clientState?.originium ?? 0));
  const inventoryIds = (args.clientState?.inventoryItemIds ?? []).slice(0, 96);
  const warehouseIds = (args.clientState?.warehouseItemIds ?? []).slice(0, 96);
  const presentNpcIds = (args.clientState?.presentNpcIds ?? []).filter((x) => typeof x === "string").slice(0, 32);

  const stats = (() => {
    const s = (args.clientState as any)?.stats;
    const obj = s && typeof s === "object" && !Array.isArray(s) ? s : null;
    const clamp = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(99, Math.trunc(n))) : 0;
    return {
      sanity: clamp(obj?.sanity),
      agility: clamp(obj?.agility),
      luck: clamp(obj?.luck),
      charm: clamp(obj?.charm),
      background: clamp(obj?.background),
    } as Record<string, number>;
  })();

  const eq = args.clientState?.equippedWeapon ?? null;
  const equippedWeapon = (() => {
    if (!eq || typeof eq !== "object" || Array.isArray(eq)) {
      return { weaponId: null, stability: null, mods: [], infusions: [], contamination: 0, repairable: true, raw: null };
    }
    const id = typeof (eq as any).id === "string" ? String((eq as any).id) : null;
    const stability = typeof (eq as any).stability === "number" ? Math.max(0, Math.min(100, Math.trunc((eq as any).stability))) : null;
    const contamination = typeof (eq as any).contamination === "number" ? Math.max(0, Math.min(100, Math.trunc((eq as any).contamination))) : 0;
    const repairable = typeof (eq as any).repairable === "boolean" ? Boolean((eq as any).repairable) : true;
    const mods = Array.isArray((eq as any).currentMods) ? (eq as any).currentMods.filter((x: any) => typeof x === "string") : [];
    const infusions = Array.isArray((eq as any).currentInfusions) ? (eq as any).currentInfusions : [];
    return { weaponId: id, stability, mods, infusions, contamination, repairable, raw: eq as Record<string, unknown> };
  })();

  const worldFlags = (args.clientState?.worldFlags ?? []).slice(0, 128);
  const profession = args.clientState?.currentProfession ?? null;
  const weaponSlotEmpty = !equippedWeapon.weaponId;

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
      record.consumes_time = true;
      addNarrativeLine(record, "配电间锻造服务当前无人值守，无法执行操作。");
      handled = true;
    } else {
    handled = applyForgeStateAudit({
      record,
      actionText,
      originium,
      equippedWeapon,
      weaponBagCount: args.clientState?.weaponBag.length ?? 0,
      inventoryMaterialCount: inventoryIds.filter((id) => /^I-/.test(id)).length,
      warehouseMaterialCount: warehouseIds.length,
    }) ||
      applyLightForgeWeaponAction({
        record,
        actionText,
        originium,
        inventoryIds,
        warehouseIds,
        equippedWeapon,
        stats,
        location,
        presentNpcIds,
        worldFlags,
        profession,
        weaponSlotEmpty,
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

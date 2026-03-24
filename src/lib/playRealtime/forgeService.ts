import { ITEMS } from "@/lib/registry/items";
import { LIGHT_FORGE_RECIPES, type LightForgeRecipe } from "@/lib/registry/forge";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import type { ForgeMaterialTag, ForgeResult, Weapon } from "@/lib/registry/types";

type ParsedWeapon = { weaponId: string | null; stability: number | null };

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.trunc(v)));
}

function asSet(xs: string[]): Set<string> {
  return new Set(xs.filter(Boolean));
}

function materialTagPool(itemIds: Set<string>, warehouseIds: Set<string>): Set<ForgeMaterialTag> {
  const tags = new Set<ForgeMaterialTag>();
  for (const it of ITEMS) {
    if (!itemIds.has(it.id)) continue;
    for (const t of it.forgeTags ?? []) tags.add(t as ForgeMaterialTag);
  }
  for (const wh of WAREHOUSE_ITEMS) {
    if (!warehouseIds.has(wh.id)) continue;
    for (const t of wh.forgeTags ?? []) tags.add(t as ForgeMaterialTag);
  }
  return tags;
}

function findRecipeFromAction(actionText: string): LightForgeRecipe | null {
  const recipeId = [...actionText.matchAll(/\b(forge_[a-z0-9_]+)\b/gi)][0]?.[1];
  if (recipeId) return LIGHT_FORGE_RECIPES.find((x) => x.id === recipeId) ?? null;
  const t = actionText.toLowerCase();
  if (actionText.includes("修复") || actionText.includes("维护") || t.includes("repair")) {
    return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_repair_basic") ?? null;
  }
  if (actionText.includes("改装") || t.includes("mod")) {
    if (actionText.includes("静音")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_mod_silent") ?? null;
    if (actionText.includes("镜")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_mod_mirror") ?? null;
    if (actionText.includes("导电")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_mod_conductive") ?? null;
    if (actionText.includes("抗污")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_mod_anti_pollution") ?? null;
    if (actionText.includes("钩索")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_mod_grappling") ?? null;
    if (actionText.includes("引声")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_mod_echo_lure") ?? null;
  }
  if (actionText.includes("灌注") || t.includes("infuse")) {
    if (actionText.includes("液")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_infuse_liquid") ?? null;
    if (actionText.includes("镜")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_infuse_mirror") ?? null;
    if (actionText.includes("认知")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_infuse_cognition") ?? null;
    if (actionText.includes("门") || actionText.includes("封")) return LIGHT_FORGE_RECIPES.find((x) => x.id === "forge_infuse_seal") ?? null;
  }
  return null;
}

export function buildLightForgePreview(args: {
  weapon: ParsedWeapon;
  inventoryIds: string[];
  warehouseIds: string[];
}): string {
  if (!args.weapon.weaponId) return "主手武器[未装备]，可执行锻造：无。";
  const itemSet = asSet(args.inventoryIds);
  const whSet = asSet(args.warehouseIds);
  const tags = materialTagPool(itemSet, whSet);
  const tagText = [...tags];
  const lines = LIGHT_FORGE_RECIPES.slice(0, 8).map((r) => {
    const required = r.requiredMaterialTags ?? [];
    const missing = required.filter((x) => !tags.has(x));
    return `${r.id}[${r.operation}|耗原石${r.costOriginium}|需${required.join("/") || "无"}|${missing.length > 0 ? `缺${missing.join("/")}` : "可执行"}]`;
  });
  return [
    `主手武器[${args.weapon.weaponId}|稳定${args.weapon.stability ?? "?"}]`,
    `可用材料标签[${tagText.join("/") || "无"}]`,
    ...lines,
  ].join("；");
}

export function executeLightForge(args: {
  actionText: string;
  originium: number;
  inventoryIds: string[];
  warehouseIds: string[];
  weapon: Weapon | null;
}): ForgeResult | null {
  const recipe = findRecipeFromAction(args.actionText);
  if (!recipe) return null;
  if (!args.weapon) {
    return {
      ok: false,
      operation: recipe.operation,
      narrative: "你没有装备主手武器，无法执行轻锻造。",
      consumedItemIds: [],
      consumedWarehouseIds: [],
      currencyChange: 0,
      weaponUpdates: [],
    };
  }
  if (!args.weapon.repairable && recipe.operation === "repair") {
    return {
      ok: false,
      operation: "repair",
      narrative: "该武器当前不可维护，需要先回到可维护状态。",
      consumedItemIds: [],
      consumedWarehouseIds: [],
      currencyChange: 0,
      weaponUpdates: [],
    };
  }
  if (args.originium < recipe.costOriginium) {
    return {
      ok: false,
      operation: recipe.operation,
      narrative: "原石不足，本次锻造中止。",
      consumedItemIds: [],
      consumedWarehouseIds: [],
      currencyChange: 0,
      weaponUpdates: [],
    };
  }

  const itemSet = asSet(args.inventoryIds);
  const whSet = asSet(args.warehouseIds);
  const tags = materialTagPool(itemSet, whSet);
  const requiredTags = recipe.requiredMaterialTags ?? [];
  const missing = requiredTags.filter((x) => !tags.has(x));
  if (missing.length > 0) {
    return {
      ok: false,
      operation: recipe.operation,
      narrative: `材料标签不足，缺少：${missing.join("、")}。`,
      consumedItemIds: [],
      consumedWarehouseIds: [],
      currencyChange: 0,
      weaponUpdates: [],
    };
  }

  const consumeItem = ITEMS.find((x) => itemSet.has(x.id) && (x.forgeTags ?? []).some((t) => requiredTags.includes(t as ForgeMaterialTag)));
  const consumeWarehouse = WAREHOUSE_ITEMS.find((x) => whSet.has(x.id) && (x.forgeTags ?? []).some((t) => requiredTags.includes(t as ForgeMaterialTag)));
  const consumedItemIds = consumeItem ? [consumeItem.id] : [];
  const consumedWarehouseIds = consumeWarehouse ? [consumeWarehouse.id] : [];

  if (recipe.operation === "repair") {
    const nextStability = clampPct((args.weapon.stability ?? 60) + 30);
    const nextPollution = clampPct((args.weapon.contamination ?? 0) - 40);
    return {
      ok: true,
      operation: "repair",
      narrative: `你完成修复，武器稳定度提升至 ${nextStability}，污染降至 ${nextPollution}。`,
      consumedItemIds,
      consumedWarehouseIds,
      currencyChange: -recipe.costOriginium,
      weaponUpdates: [{
        weaponId: args.weapon.id,
        stability: nextStability,
        contamination: nextPollution,
        repairable: true,
      }],
    };
  }

  if (recipe.operation === "mod" && recipe.weaponMod) {
    const mods = [...new Set([...(args.weapon.currentMods ?? []), recipe.weaponMod])];
    return {
      ok: true,
      operation: "mod",
      narrative: `你完成改装：${recipe.name}，武器模块已更新。`,
      consumedItemIds,
      consumedWarehouseIds,
      currencyChange: -recipe.costOriginium,
      weaponUpdates: [{
        weaponId: args.weapon.id,
        currentMods: mods,
        contamination: clampPct((args.weapon.contamination ?? 0) + 5),
      }],
    };
  }

  if (recipe.operation === "infuse" && recipe.infusionTag) {
    const kept = (args.weapon.currentInfusions ?? []).filter((x) => x.threatTag !== recipe.infusionTag);
    const nextInfusions = [...kept, { threatTag: recipe.infusionTag, turnsLeft: 3 }];
    return {
      ok: true,
      operation: "infuse",
      narrative: `你完成灌注：${recipe.name}，本次灌注持续 3 回合。`,
      consumedItemIds,
      consumedWarehouseIds,
      currencyChange: -recipe.costOriginium,
      weaponUpdates: [{
        weaponId: args.weapon.id,
        currentInfusions: nextInfusions,
        contamination: clampPct((args.weapon.contamination ?? 0) + 10),
      }],
    };
  }

  return {
    ok: false,
    operation: recipe.operation,
    narrative: "锻造台没有响应此次操作。",
    consumedItemIds: [],
    consumedWarehouseIds: [],
    currencyChange: 0,
    weaponUpdates: [],
  };
}


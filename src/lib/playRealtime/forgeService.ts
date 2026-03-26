import { ITEMS } from "@/lib/registry/items";
import { LIGHT_FORGE_RECIPES, type LightForgeRecipe } from "@/lib/registry/forge";
import { WAREHOUSE_ITEMS } from "@/lib/registry/warehouseItems";
import type { ForgeMaterialTag, ForgeResult, ItemTier, StatRequirement, Weapon, WeaponTier } from "@/lib/registry/types";
import { WEAPON_TEMPLATES } from "@/lib/registry/weapons";

type ParsedWeapon = { weaponId: string | null; stability: number | null };

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, Math.trunc(v)));
}

function isTierGte(a: ItemTier, min: WeaponTier): boolean {
  const rank: Record<ItemTier, number> = { D: 0, C: 1, B: 2, A: 3, S: 4 };
  return (rank[a] ?? 0) >= (rank[min] ?? 0);
}

function mergeStatRequirements(reqs: Array<StatRequirement | undefined>): StatRequirement | undefined {
  const out: Record<string, number> = {};
  let touched = false;
  for (const r of reqs) {
    if (!r) continue;
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const prev = typeof out[k] === "number" ? out[k] : 0;
      out[k] = Math.max(prev, Math.trunc(v));
      touched = true;
    }
  }
  return touched ? (out as StatRequirement) : undefined;
}

function pickWeaponTemplateForItems(itemIds: string[]): { templateId: string; counterTags: string[] } {
  const items = itemIds.map((id) => ITEMS.find((x) => x.id === id)).filter(Boolean);
  const tagSet = new Set<string>();
  const forgeTagSet = new Set<string>();
  for (const it of items) {
    for (const t of String(it!.tags ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) tagSet.add(t);
    for (const ft of it!.forgeTags ?? []) forgeTagSet.add(String(ft));
    const eff = it!.effectType;
    if (eff) tagSet.add(String(eff));
  }
  const wantsMirror = tagSet.has("mirror") || forgeTagSet.has("mirror");
  const wantsSeal = tagSet.has("seal") || tagSet.has("key") || forgeTagSet.has("sealant");
  const wantsSound = tagSet.has("sound") || forgeTagSet.has("sound");
  const wantsTime = tagSet.has("time") || tagSet.has("anchor");
  const tpl =
    (wantsMirror ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("mirror")) : null) ??
    (wantsSeal ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("seal")) : null) ??
    (wantsSound ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("sound")) : null) ??
    (wantsTime ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("time")) : null) ??
    WEAPON_TEMPLATES[0]!;
  const derivedCounterTags = [
    ...new Set([...(tpl.counterTags ?? []), ...(wantsMirror ? ["mirror"] : []), ...(wantsSeal ? ["seal"] : []), ...(wantsSound ? ["sound"] : []), ...(wantsTime ? ["time"] : [])]),
  ];
  return { templateId: tpl.templateId, counterTags: derivedCounterTags };
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
  /** 可选：用于展示“武器化”候选（需要 stats 才能判断门槛；缺省则只提示数量/品级） */
  stats?: Record<string, number>;
}): string {
  const itemSet = asSet(args.inventoryIds);
  const whSet = asSet(args.warehouseIds);
  const tags = materialTagPool(itemSet, whSet);
  const tagText = [...tags];

  // 武器化预览：不依赖已装备武器；但需要“武器栏为空”才能执行。
  const weaponSlotEmpty = !args.weapon.weaponId;
  const invItems = args.inventoryIds
    .map((id) => ITEMS.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const eligibleC = invItems.filter((i) => isTierGte(i.tier, "C"));
  const eligibleB = invItems.filter((i) => isTierGte(i.tier, "B"));
  const eligibleA = invItems.filter((i) => i.tier === "A" || i.tier === "S");
  const eligibleS = invItems.filter((i) => i.tier === "S");
  const weaponizeLines = [
    `武器化[武器栏${weaponSlotEmpty ? "空" : "占用"}]：` +
      (weaponSlotEmpty ? "可尝试" : "需先卸下武器"),
    `forge_weaponize_c[需C+×3|候选${eligibleC.length}|耗原石5]`,
    `forge_weaponize_b[需B+×2|候选${eligibleB.length}|耗原石10]`,
    `forge_weaponize_a[需A×1|候选${eligibleA.length}|耗原石20]`,
    `forge_weaponize_s[需S×1|候选${eligibleS.length}|耗原石50]`,
  ];

  if (!args.weapon.weaponId) {
    return [
      `主手武器[未装备]`,
      `可用材料标签[${tagText.join("/") || "无"}]`,
      ...weaponizeLines,
      ...LIGHT_FORGE_RECIPES.filter((r) => r.operation !== "weaponize").slice(0, 6).map((r) => {
        const required = r.requiredMaterialTags ?? [];
        const missing = required.filter((x) => !tags.has(x));
        return `${r.id}[${r.operation}|耗原石${r.costOriginium}|需${required.join("/") || "无"}|${missing.length > 0 ? `缺${missing.join("/")}` : "可执行"}]`;
      }),
    ].join("；");
  }
  const lines = LIGHT_FORGE_RECIPES.filter((r) => r.operation !== "weaponize").slice(0, 8).map((r) => {
    const required = r.requiredMaterialTags ?? [];
    const missing = required.filter((x) => !tags.has(x));
    return `${r.id}[${r.operation}|耗原石${r.costOriginium}|需${required.join("/") || "无"}|${missing.length > 0 ? `缺${missing.join("/")}` : "可执行"}]`;
  });
  return [
    `主手武器[${args.weapon.weaponId}|稳定${args.weapon.stability ?? "?"}]`,
    `可用材料标签[${tagText.join("/") || "无"}]`,
    ...weaponizeLines,
    ...lines,
  ].join("；");
}

export function executeLightForge(args: {
  actionText: string;
  originium: number;
  inventoryIds: string[];
  warehouseIds: string[];
  weapon: Weapon | null;
  /** 武器化需要：玩家属性（用于校验原道具门槛不可绕过） */
  stats?: Record<string, number>;
  /** 武器化需要：当前武器栏是否为空（由上游基于 playerContext 解析） */
  weaponSlotEmpty?: boolean;
  /** 武器化需要：结构化折扣输入（由上游 guard 计算，不允许模型随口“免费”） */
  weaponizePricing?: {
    baseCostOriginium: number;
    finalCostOriginium: number;
    discountApplied: boolean;
    discountReasonCodes: string[];
  };
}): ForgeResult | null {
  const recipe = findRecipeFromAction(args.actionText);
  if (!recipe) return null;

  // ---------------------------
  // 新增：高级道具→武器化
  // ---------------------------
  if (recipe.operation === "weaponize" && recipe.weaponize) {
    const meta = recipe.weaponize;
    const text = String(args.actionText ?? "");
    const weaponSlotEmpty = args.weaponSlotEmpty !== false; // default true
    if (!weaponSlotEmpty) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: "你的武器栏已装备武器。请先卸下（回到行囊）后再进行武器化，或按流程执行替换。",
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    const itemIdsInText = [...text.matchAll(/\b(I-[A-Z]\d{2})\b/g)].map((m) => m[1]).filter(Boolean);
    const invSet = asSet(args.inventoryIds);
    const picked = itemIdsInText.length > 0 ? itemIdsInText.filter((id) => invSet.has(id)) : [];
    if (itemIdsInText.length > 0 && picked.length !== itemIdsInText.length) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: "你指定的部分道具不在行囊中，武器化中止。",
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    if (picked.length !== meta.requiredItemCount) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: `武器化配方数量不匹配：需要 ${meta.requiredItemCount} 件道具。请在指令中明确列出道具ID（例如：${meta.requiredItemCount === 3 ? "I-C12 I-C13 I-C14" : "I-B01 I-B02"}）。`,
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    const srcItems = picked.map((id) => ITEMS.find((x) => x.id === id)).filter(Boolean);
    if (srcItems.length !== picked.length) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: "你选取的道具无法识别为可武器化的注册道具，锻造台拒绝执行。",
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    // 品级校验：禁止 D，且必须达到 requiredMinItemTier
    const badTier = srcItems.find((it) => !isTierGte(it!.tier, meta.requiredMinItemTier));
    if (badTier) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: `道具品级不符合：${badTier!.id} 为 ${badTier!.tier}，至少需要 ${meta.requiredMinItemTier}。`,
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    // 不允许绕过原始属性要求：必须满足所有来源道具的 statRequirements（取“逐项最大值”做合并门槛）
    const mergedReq = mergeStatRequirements(srcItems.map((x) => x!.statRequirements));
    if (mergedReq && args.stats) {
      for (const [k, v] of Object.entries(mergedReq)) {
        const cur = Number(args.stats[k] ?? 0);
        if (!Number.isFinite(cur) || cur < Number(v)) {
          return {
            ok: false,
            operation: "weaponize",
            narrative: `你的属性未满足武器化门槛：需要 ${k}≥${v}（来自原道具使用条件），当前为 ${cur}。`,
            consumedItemIds: [],
            consumedWarehouseIds: [],
            currencyChange: 0,
            weaponUpdates: [],
          };
        }
      }
    } else if (mergedReq && !args.stats) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: "无法读取你的属性以校验原道具门槛，武器化中止。",
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }

    // 费用：严格执行四档费用；折扣只能来自结构化输入（上游 guard 计算）
    const pricing = args.weaponizePricing ?? {
      baseCostOriginium: recipe.costOriginium,
      finalCostOriginium: recipe.costOriginium,
      discountApplied: false,
      discountReasonCodes: [],
    };
    const strictBase = recipe.costOriginium;
    if (pricing.baseCostOriginium !== strictBase) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: "锻造台计价模块异常（基础费用不一致），本次武器化被中止。",
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    if (pricing.finalCostOriginium < 0 || pricing.finalCostOriginium > pricing.baseCostOriginium) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: "折扣计算非法（费用越界），本次武器化被中止。",
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }
    if (args.originium < pricing.finalCostOriginium) {
      return {
        ok: false,
        operation: "weaponize",
        narrative: `原石不足，本次武器化中止（需要${pricing.finalCostOriginium}）。`,
        consumedItemIds: [],
        consumedWarehouseIds: [],
        currencyChange: 0,
        weaponUpdates: [],
      };
    }

    // 生成：继承效果映射 + 自动装备到单武器栏
    const effectType = srcItems[0]!.effectType;
    const effectSummary = srcItems[0]!.effectSummary;
    const templatePick = pickWeaponTemplateForItems(picked);
    const newWeapon: Weapon = {
      id: `WZ-${meta.targetTier}-${picked.join("-")}`.slice(0, 64),
      name: `武器化·${srcItems[0]!.name}`,
      description: `由高级道具武器化而成，可反复使用（不再消耗）。`,
      counterThreatIds: [],
      counterTags: templatePick.counterTags,
      stability: 80,
      calibratedThreatId: null,
      modSlots: ["core", "surface"],
      currentMods: [],
      currentInfusions: [],
      contamination: 0,
      repairable: true,
      tier: meta.targetTier,
      equipSlot: "weapon_main",
      equipTimeCostTurns: 1,
      effectSource: {
        effectType,
        effectSummary,
        statRequirements: mergedReq,
        primaryEffectNote: "武器继承原道具主要效果与门槛，但改为装备型可重复使用。",
      },
      provenance: {
        kind: "weaponize",
        sourceItemIds: picked,
        targetTier: meta.targetTier,
        payment: {
          baseCostOriginium: pricing.baseCostOriginium,
          finalCostOriginium: pricing.finalCostOriginium,
          discountApplied: pricing.discountApplied,
          discountReasonCodes: pricing.discountReasonCodes,
        },
      },
    };
    const discountLine =
      pricing.discountApplied ? `（已应用折扣：${pricing.discountReasonCodes.join("、") || "discount"}）` : "";
    return {
      ok: true,
      operation: "weaponize",
      narrative: `你将道具武器化完成，武器已自动装备到武器栏，费用 ${pricing.finalCostOriginium} 原石${discountLine}。`,
      consumedItemIds: picked,
      consumedWarehouseIds: [],
      currencyChange: -pricing.finalCostOriginium,
      weaponUpdates: [
        {
          weapon: newWeapon,
          // 额外兜底：即便前端尚未支持 weapon 对象，也可以按模板绑定（由上游决定是否需要）
          // weaponId: "WPN-001",
        },
      ],
    };
  }

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


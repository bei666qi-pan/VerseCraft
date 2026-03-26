import type {
  ForgeMaterialTag,
  ForgeOperation,
  ForgeRecipe,
  WeaponTier,
  WeaponModKind,
} from "./types";

export type LightForgeRecipe = ForgeRecipe & {
  operation: ForgeOperation;
  weaponMod?: WeaponModKind;
  infusionTag?: "liquid" | "mirror" | "cognition" | "seal";
  /**
   * 高级道具→武器化 配方元数据（新增）
   * - 兼容策略：作为可选字段挂在现有配方结构上，不影响 repair/mod/infuse。
   */
  weaponize?: {
    targetTier: WeaponTier;
    requiredItemCount: number;
    requiredMinItemTier: WeaponTier;
    /** 仅在 B1_PowerRoom 锻造台允许 */
    onlyAtNodeId: "B1_PowerRoom";
  };
};

export const LIGHT_FORGE_RECIPES: readonly LightForgeRecipe[] = [
  {
    id: "forge_repair_basic",
    operation: "repair",
    name: "基础修复",
    description: "恢复稳定度并清理污染。",
    costOriginium: 1,
    requiredMaterialTags: ["insulation"],
  },
  {
    id: "forge_mod_silent",
    operation: "mod",
    name: "静音改装",
    description: "降低声学暴露，提升潜行应对。",
    costOriginium: 2,
    requiredMaterialTags: ["sound", "fiber"],
    weaponMod: "silent",
  },
  {
    id: "forge_mod_mirror",
    operation: "mod",
    name: "镜面改装",
    description: "增强镜像反制能力。",
    costOriginium: 2,
    requiredMaterialTags: ["mirror"],
    weaponMod: "mirror",
  },
  {
    id: "forge_mod_conductive",
    operation: "mod",
    name: "导电改装",
    description: "增强导电传导，适配液态与回路目标。",
    costOriginium: 2,
    requiredMaterialTags: ["conductive"],
    weaponMod: "conductive",
  },
  {
    id: "forge_mod_anti_pollution",
    operation: "mod",
    name: "抗污改装",
    description: "降低污染堆积速度。",
    costOriginium: 2,
    requiredMaterialTags: ["pollution", "insulation"],
    weaponMod: "anti_pollution",
  },
  {
    id: "forge_mod_grappling",
    operation: "mod",
    name: "钩索改装",
    description: "提升跨障碍机动处理能力。",
    costOriginium: 2,
    requiredMaterialTags: ["fiber", "sealant"],
    weaponMod: "grappling",
  },
  {
    id: "forge_mod_echo_lure",
    operation: "mod",
    name: "引声改装",
    description: "可诱导声学目标偏转注意。",
    costOriginium: 2,
    requiredMaterialTags: ["sound"],
    weaponMod: "echo_lure",
  },
  {
    id: "forge_infuse_liquid",
    operation: "infuse",
    name: "液态灌注",
    description: "短时提升对液态威胁的作用。",
    costOriginium: 1,
    requiredMaterialTags: ["conductive", "pollution"],
    infusionTag: "liquid",
  },
  {
    id: "forge_infuse_mirror",
    operation: "infuse",
    name: "镜像灌注",
    description: "短时提升对镜像威胁的作用。",
    costOriginium: 1,
    requiredMaterialTags: ["mirror"],
    infusionTag: "mirror",
  },
  {
    id: "forge_infuse_cognition",
    operation: "infuse",
    name: "认知灌注",
    description: "短时提升对认知污染的作用。",
    costOriginium: 1,
    requiredMaterialTags: ["pollution", "insulation"],
    infusionTag: "cognition",
  },
  {
    id: "forge_infuse_seal",
    operation: "infuse",
    name: "门扉封印灌注",
    description: "短时提升对门缝与封印目标的作用。",
    costOriginium: 1,
    requiredMaterialTags: ["sealant"],
    infusionTag: "seal",
  },
  // ---------------------------
  // Stage-3: 高级道具→武器化（严格费用 + 严格数量 + 严格品级）
  // 命名约定：forge_weaponize_{tier}
  // ---------------------------
  {
    id: "forge_weaponize_c",
    operation: "weaponize",
    name: "道具武器化（C）",
    description: "将 3 个 C 级及以上道具武器化为 1 把 C 级武器（自动装备）。",
    costOriginium: 5,
    weaponize: {
      targetTier: "C",
      requiredItemCount: 3,
      requiredMinItemTier: "C",
      onlyAtNodeId: "B1_PowerRoom",
    },
  },
  {
    id: "forge_weaponize_b",
    operation: "weaponize",
    name: "道具武器化（B）",
    description: "将 2 个 B 级及以上道具武器化为 1 把 B 级武器（自动装备）。",
    costOriginium: 10,
    weaponize: {
      targetTier: "B",
      requiredItemCount: 2,
      requiredMinItemTier: "B",
      onlyAtNodeId: "B1_PowerRoom",
    },
  },
  {
    id: "forge_weaponize_a",
    operation: "weaponize",
    name: "道具武器化（A）",
    description: "将 1 个 A 级道具武器化为 1 把 A 级武器（自动装备）。",
    costOriginium: 20,
    weaponize: {
      targetTier: "A",
      requiredItemCount: 1,
      requiredMinItemTier: "A",
      onlyAtNodeId: "B1_PowerRoom",
    },
  },
  {
    id: "forge_weaponize_s",
    operation: "weaponize",
    name: "道具武器化（S）",
    description: "将 1 个 S 级道具武器化为 1 把 S 级武器（自动装备）。",
    costOriginium: 50,
    weaponize: {
      targetTier: "S",
      requiredItemCount: 1,
      requiredMinItemTier: "S",
      onlyAtNodeId: "B1_PowerRoom",
    },
  },
] as const;

export const LIGHT_FORGE_MOD_HINTS: Record<WeaponModKind, string> = {
  silent: "静音：压低噪声外泄，适合听觉锁定型威胁。",
  mirror: "镜面：对镜像/倒行目标更稳定。",
  conductive: "导电：对液态与回路类目标更有效。",
  anti_pollution: "抗污：降低污染累积与失稳概率。",
  grappling: "钩索：提升跨层机动与快速撤离能力。",
  echo_lure: "引声：可制造可控声源误导目标。",
};

export function recipeNeedsTag(recipe: LightForgeRecipe, tag: ForgeMaterialTag): boolean {
  return (recipe.requiredMaterialTags ?? []).includes(tag);
}


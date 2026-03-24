import type {
  ForgeMaterialTag,
  ForgeOperation,
  ForgeRecipe,
  WeaponModKind,
} from "./types";

export type LightForgeRecipe = ForgeRecipe & {
  operation: ForgeOperation;
  weaponMod?: WeaponModKind;
  infusionTag?: "liquid" | "mirror" | "cognition" | "seal";
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


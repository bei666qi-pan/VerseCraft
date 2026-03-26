import type { Weapon, WeaponTier, WeaponizationRecipe } from "./types";

/**
 * 兼容层说明（重要）：
 * - 旧系统把武器当作“固定少量死表”，并由 `getWeaponById()` 直接返回该表项。
 * - 新核心设定：武器不是独立掉落体系，而是“高级道具武器化”的结果（C+ 道具 → 武器）。
 *
 * 兼容策略：
 * - 保留旧的 `WEAPONS` 出口（避免现有代码大面积崩）。
 * - 新增“基础武器模板 + 武器化配方”体系，为后续锻造台/服务端权威裁决提供数据模型入口。
 * - 旧死表项在语义上视为“模板/演示武器”（provenance.kind=legacy_catalog），并补充 `tier`。
 */

/** 基础武器模板（不等于“独立掉落物”）；用于生成/绑定武器化结果的表现层骨架。 */
export type WeaponTemplate = Omit<
  Weapon,
  "id" | "tier" | "provenance" | "effectSource"
> & {
  templateId: string;
  /** 模板建议阶级（用于默认 tier；真正 tier 由配方/武器化结果决定） */
  suggestedTier: WeaponTier;
};

export const WEAPON_TEMPLATES: readonly WeaponTemplate[] = [
  {
    templateId: "tpl.sound.silent_baton",
    suggestedTier: "C",
    name: "静默短棍",
    description: "抑制声响与误触，适合对抗听觉锁定型主威胁。",
    counterThreatIds: ["A-002"],
    counterTags: ["sound", "silence"],
    stability: 80,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
    equipSlot: "weapon_main",
    equipTimeCostTurns: 1,
  },
  {
    templateId: "tpl.time.clock_spike",
    suggestedTier: "C",
    name: "时针刺",
    description: "用于打断局部时间错位，适合对抗时间扭曲主威胁。",
    counterThreatIds: ["A-001"],
    counterTags: ["time", "anchor"],
    stability: 75,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
    equipSlot: "weapon_main",
    equipTimeCostTurns: 1,
  },
  {
    templateId: "tpl.mirror.mirror_dagger",
    suggestedTier: "C",
    name: "镜背匕",
    description: "借镜像反射确认方位，适合对抗倒行与镜像相关主威胁。",
    counterThreatIds: ["A-006"],
    counterTags: ["mirror", "direction"],
    stability: 70,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
    equipSlot: "weapon_main",
    equipTimeCostTurns: 1,
  },
  {
    templateId: "tpl.seal.sealing_spike",
    suggestedTier: "C",
    name: "封缄钉",
    description: "用于临时封缄门缝与裂隙，适合对抗门扉执念型主威胁。",
    counterThreatIds: ["A-007"],
    counterTags: ["seal", "door"],
    stability: 65,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: [],
    currentInfusions: [],
    contamination: 0,
    repairable: true,
    equipSlot: "weapon_main",
    equipTimeCostTurns: 1,
  },
] as const;

/** 旧出口：仍提供少量固定武器，供现有系统继续按 id 取用。 */
export const WEAPONS: readonly Weapon[] = [
  {
    id: "WPN-001",
    tier: "C",
    provenance: { kind: "legacy_catalog", legacyTag: "stage2_minimal_catalog" },
    effectSource: { primaryEffectNote: "兼容层：旧武器表项，后续可由武器化结果替代。" },
    ...WEAPON_TEMPLATES[0]!,
  },
  {
    id: "WPN-002",
    tier: "C",
    provenance: { kind: "legacy_catalog", legacyTag: "stage2_minimal_catalog" },
    effectSource: { primaryEffectNote: "兼容层：旧武器表项，后续可由武器化结果替代。" },
    ...WEAPON_TEMPLATES[1]!,
  },
  {
    id: "WPN-003",
    tier: "C",
    provenance: { kind: "legacy_catalog", legacyTag: "stage2_minimal_catalog" },
    effectSource: { primaryEffectNote: "兼容层：旧武器表项，后续可由武器化结果替代。" },
    ...WEAPON_TEMPLATES[2]!,
  },
  {
    id: "WPN-004",
    tier: "C",
    provenance: { kind: "legacy_catalog", legacyTag: "stage2_minimal_catalog" },
    effectSource: { primaryEffectNote: "兼容层：旧武器表项，后续可由武器化结果替代。" },
    ...WEAPON_TEMPLATES[3]!,
  },
] as const;

/**
 * 武器化配方注册表（数据层）。
 *
 * 说明：
 * - 本表只表达规则，不负责“从道具生成武器”的具体算法与裁决（应由锻造台/服务端权威链路实现）。
 * - 费用折扣：仅声明“允许”与“来源条件类型”，真正是否满足由运行时根据 NPC 好感/盟友/服务解锁判定。
 */
export const WEAPONIZATION_RECIPES: readonly WeaponizationRecipe[] = [
  {
    id: "weaponize_C",
    targetTier: "C",
    requiredItemCount: 3,
    requiredMinItemTier: "C",
    baseCostOriginium: 5,
    discountAllowed: true,
    discountSources: [],
    generationStrategy: { kind: "inherit_primary", allowMixedSources: true },
    canRepeatForge: true,
  },
  {
    id: "weaponize_B",
    targetTier: "B",
    requiredItemCount: 2,
    requiredMinItemTier: "B",
    baseCostOriginium: 10,
    discountAllowed: true,
    discountSources: [],
    generationStrategy: { kind: "inherit_primary", allowMixedSources: true },
    canRepeatForge: true,
  },
  {
    id: "weaponize_A",
    targetTier: "A",
    requiredItemCount: 1,
    requiredMinItemTier: "A",
    baseCostOriginium: 20,
    discountAllowed: true,
    discountSources: [],
    generationStrategy: { kind: "inherit_primary", allowMixedSources: false },
    canRepeatForge: true,
  },
  {
    id: "weaponize_S",
    targetTier: "S",
    requiredItemCount: 1,
    requiredMinItemTier: "S",
    baseCostOriginium: 50,
    discountAllowed: true,
    discountSources: [],
    generationStrategy: { kind: "inherit_primary", allowMixedSources: false },
    canRepeatForge: true,
  },
] as const;

export function getWeaponById(id: string | null | undefined): Weapon | null {
  if (!id) return null;
  return WEAPONS.find((x) => x.id === id) ?? null;
}


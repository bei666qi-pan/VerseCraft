import type { Item, Weapon, WeaponTier } from "@/lib/registry/types";
import { WEAPONIZATION_RECIPES } from "@/lib/registry/weapons";

export type WeaponLifecycleStage =
  | "raw_material_source"
  | "weaponization_ready"
  | "weaponization_previewable"
  | "forged"
  | "equipped"
  | "unstable_or_polluted"
  | "needs_maintenance"
  | "reforgable";

type TierRank = { D: 0; C: 1; B: 2; A: 3; S: 4 };
const TIER_RANK: TierRank = { D: 0, C: 1, B: 2, A: 3, S: 4 };

function isTierGte(tier: string, min: WeaponTier): boolean {
  const r = (TIER_RANK as any)[tier] ?? -1;
  return r >= (TIER_RANK as any)[min];
}

export function countWeaponizableItems(inventory: Item[], minTier: WeaponTier): number {
  const inv = Array.isArray(inventory) ? inventory : [];
  return inv.filter((it) => {
    if (!it || typeof it !== "object") return false;
    const tier = String((it as any).tier ?? "");
    if (!tier) return false;
    // explicit override if present
    const eligible = (it as any).weaponization?.eligible;
    if (eligible === false) return false;
    if (eligible === true) return isTierGte(tier, minTier);
    return isTierGte(tier, minTier);
  }).length;
}

export function computeWeaponMaintenanceBand(weapon: Weapon | null): {
  unstableOrPolluted: boolean;
  needsMaintenance: boolean;
  reasons: string[];
} {
  if (!weapon) return { unstableOrPolluted: false, needsMaintenance: false, reasons: [] };
  const stability = Number((weapon as any).stability ?? 0);
  const contamination = Number((weapon as any).contamination ?? 0);
  const repairable = Boolean((weapon as any).repairable);
  const unstableOrPolluted = (Number.isFinite(stability) ? stability : 0) < 50 || (Number.isFinite(contamination) ? contamination : 0) >= 70;
  const needsMaintenance = repairable && (((Number.isFinite(stability) ? stability : 0) < 65) || ((Number.isFinite(contamination) ? contamination : 0) >= 40));
  const reasons: string[] = [];
  if (unstableOrPolluted) reasons.push("已进入高风险区（容易在关键回合失手）");
  if (needsMaintenance) reasons.push("建议维护（让稳定/污染回到可控区间）");
  if (!repairable) reasons.push("当前不可维护（要么更换，要么等修复机会/服务）");
  return { unstableOrPolluted, needsMaintenance, reasons };
}

export function computeWeaponizationReadiness(args: {
  inventory: Item[];
  originium: number;
}): Array<{
  tier: WeaponTier;
  recipeId: string;
  ready: boolean;
  missingReason: string | null;
  candidateCount: number;
  requiredItemCount: number;
  cost: number;
}> {
  const out: Array<{
    tier: WeaponTier;
    recipeId: string;
    ready: boolean;
    missingReason: string | null;
    candidateCount: number;
    requiredItemCount: number;
    cost: number;
  }> = [];
  for (const r of WEAPONIZATION_RECIPES) {
    const candidateCount = countWeaponizableItems(args.inventory, r.requiredMinItemTier);
    const costOk = (args.originium ?? 0) >= r.baseCostOriginium;
    const countOk = candidateCount >= r.requiredItemCount;
    const ready = costOk && countOk;
    const missingReason = ready
      ? null
      : !countOk
        ? `原料不足（需${r.requiredMinItemTier}+×${r.requiredItemCount}）`
        : `原石不足（需${r.baseCostOriginium}）`;
    out.push({
      tier: r.targetTier,
      recipeId: r.id,
      ready,
      missingReason,
      candidateCount,
      requiredItemCount: r.requiredItemCount,
      cost: r.baseCostOriginium,
    });
  }
  // 高阶优先展示
  const rank: Record<WeaponTier, number> = { C: 1, B: 2, A: 3, S: 4 };
  return out.sort((a, b) => (rank[b.tier] ?? 0) - (rank[a.tier] ?? 0));
}

export function computeWeaponLifecycleStages(args: {
  equippedWeapon: Weapon | null;
  inventory: Item[];
  originium: number;
}): { stages: WeaponLifecycleStage[]; notes: string[] } {
  const stages: WeaponLifecycleStage[] = [];
  const notes: string[] = [];
  const inv = Array.isArray(args.inventory) ? args.inventory : [];
  if (inv.length > 0) stages.push("raw_material_source");
  const readiness = computeWeaponizationReadiness({ inventory: inv, originium: args.originium ?? 0 });
  if (readiness.some((x) => x.candidateCount > 0)) stages.push("weaponization_previewable");
  if (readiness.some((x) => x.ready)) stages.push("weaponization_ready");

  if (args.equippedWeapon) {
    stages.push("forged");
    stages.push("equipped");
    const band = computeWeaponMaintenanceBand(args.equippedWeapon);
    if (band.unstableOrPolluted) stages.push("unstable_or_polluted");
    if (band.needsMaintenance) stages.push("needs_maintenance");
    if (band.reasons.length > 0) notes.push(...band.reasons);
  } else {
    // 没武器时：若 ready，则说明“可锻造→装备”这条线是可走的
    if (readiness.some((x) => x.ready)) notes.push("你已经凑得出一把主手：该去配电间把原料变成对策。");
  }

  if (readiness.some((x) => x.ready)) stages.push("reforgable");
  return { stages: Array.from(new Set(stages)), notes: notes.slice(0, 4) };
}


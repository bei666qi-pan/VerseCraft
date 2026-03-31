import type { Item, Weapon, WeaponTier } from "@/lib/registry/types";
import { WEAPONIZATION_RECIPES, WEAPON_TEMPLATES } from "@/lib/registry/weapons";

function tierRank(t: string): number {
  if (t === "S") return 4;
  if (t === "A") return 3;
  if (t === "B") return 2;
  if (t === "C") return 1;
  if (t === "D") return 0;
  return -1;
}

function isTierGte(tier: string, min: WeaponTier): boolean {
  return tierRank(tier) >= tierRank(min);
}

function isWeaponizableItem(it: Item, minTier: WeaponTier): boolean {
  const tier = String((it as any).tier ?? "");
  if (!tier) return false;
  const eligible = (it as any).weaponization?.eligible;
  if (eligible === false) return false;
  return isTierGte(tier, minTier);
}

function extractSoftTags(it: Item): string[] {
  const out: string[] = [];
  const tags = String((it as any).tags ?? "");
  for (const t of tags.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) out.push(t);
  const forge = Array.isArray((it as any).forgeTags) ? (it as any).forgeTags : [];
  for (const t of forge) out.push(String(t).toLowerCase());
  const eff = (it as any).effectType;
  if (typeof eff === "string" && eff) out.push(eff.toLowerCase());
  return Array.from(new Set(out)).slice(0, 12);
}

function pickTemplateFromTags(tags: string[]): (typeof WEAPON_TEMPLATES)[number] {
  const set = new Set(tags);
  const wantsMirror = set.has("mirror");
  const wantsSeal = set.has("seal") || set.has("sealant") || set.has("door") || set.has("key");
  const wantsSound = set.has("sound") || set.has("silence");
  const wantsTime = set.has("time") || set.has("anchor");
  return (
    (wantsMirror ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("mirror")) : null) ??
    (wantsSeal ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("seal")) : null) ??
    (wantsSound ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("sound")) : null) ??
    (wantsTime ? WEAPON_TEMPLATES.find((t) => t.templateId.includes("time")) : null) ??
    WEAPON_TEMPLATES[0]!
  );
}

export type WeaponizationPreview = {
  recipeId: string;
  targetTier: WeaponTier;
  costOriginium: number;
  requiredItemCount: number;
  requiredMinTier: WeaponTier;
  candidateItems: Array<{ id: string; name: string; tier: string; tags: string[] }>;
  ready: boolean;
  readyReason: string;
  suggestedTemplate: { templateId: string; name: string; counterTags: string[]; description: string };
  suggestedCommand: string;
  riskHint: string;
};

export function buildWeaponizationPreviews(args: {
  inventory: Item[];
  originium: number;
  equippedWeapon: Weapon | null;
}): WeaponizationPreview[] {
  const inv = Array.isArray(args.inventory) ? args.inventory : [];
  const originium = Math.max(0, Math.trunc(args.originium ?? 0));
  const slotEmpty = !args.equippedWeapon;

  const previews: WeaponizationPreview[] = [];
  for (const r of WEAPONIZATION_RECIPES) {
    const candidates = inv
      .filter((it) => isWeaponizableItem(it, r.requiredMinItemTier))
      .map((it) => ({
        id: String((it as any).id ?? ""),
        name: String((it as any).name ?? ""),
        tier: String((it as any).tier ?? ""),
        tags: extractSoftTags(it),
      }))
      .filter((x) => x.id && x.name)
      .sort((a, b) => tierRank(b.tier) - tierRank(a.tier))
      .slice(0, 8);
    const enoughItems = candidates.length >= r.requiredItemCount;
    const enoughMoney = originium >= r.baseCostOriginium;
    const ready = slotEmpty && enoughItems && enoughMoney;
    const readyReason = !slotEmpty
      ? "武器栏被占用：先卸下/更换"
      : !enoughItems
        ? `原料不足：需要 ${r.requiredMinItemTier}+×${r.requiredItemCount}`
        : !enoughMoney
          ? `原石不足：需要 ${r.baseCostOriginium}`
          : "可在配电间尝试武器化";

    const chosen = candidates.slice(0, r.requiredItemCount);
    const mergedTags = Array.from(new Set(chosen.flatMap((x) => x.tags))).slice(0, 16);
    const tpl = pickTemplateFromTags(mergedTags);
    const riskHint =
      r.targetTier === "C"
        ? "风险偏低：更像“可靠工具”，适合先建立对策习惯。"
        : r.targetTier === "B"
          ? "风险中等：收益更明确，但污染与维护会更频繁。"
          : r.targetTier === "A"
            ? "风险偏高：别指望白嫖，准备为维护与代价买单。"
            : "风险极高：更像契约，不是装备。";

    const cmdBase = `forge_weaponize_${String(r.targetTier).toLowerCase()}`;
    const pickedIds = chosen.map((x) => x.id).join(" ");
    const suggestedCommand = pickedIds ? `${cmdBase} ${pickedIds}` : `${cmdBase} <道具ID...>`;
    previews.push({
      recipeId: r.id,
      targetTier: r.targetTier,
      costOriginium: r.baseCostOriginium,
      requiredItemCount: r.requiredItemCount,
      requiredMinTier: r.requiredMinItemTier,
      candidateItems: candidates,
      ready,
      readyReason,
      suggestedTemplate: {
        templateId: tpl.templateId,
        name: tpl.name,
        counterTags: tpl.counterTags.slice(0, 6),
        description: tpl.description,
      },
      suggestedCommand,
      riskHint,
    });
  }
  const rank: Record<WeaponTier, number> = { C: 1, B: 2, A: 3, S: 4 };
  return previews.sort((a, b) => (rank[b.targetTier] ?? 0) - (rank[a.targetTier] ?? 0));
}


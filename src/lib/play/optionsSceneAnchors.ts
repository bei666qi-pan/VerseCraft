import { NPCS } from "@/lib/registry/npcs";
import { getNpcAliases } from "@/lib/registry/npcAliases";
import { ITEMS } from "@/lib/registry/items";
import { formatLocationLabel } from "@/lib/ui/locationLabels";

const LOCATION_OPTION_ALIASES: Record<string, readonly string[]> = {
  B1_PowerRoom: ["配电间", "电源室"],
};

const ITEM_OPTION_ALIASES: Array<{ match: RegExp; terms: readonly string[] }> = [
  { match: /手电/, terms: ["手电筒", "手电"] },
];

const LEGACY_INVENTORY_ID_ALIASES: Record<string, readonly string[]> = {
  item_phone: ["手机"],
  item_bandage: ["绷带"],
};

const WEAPON_OPTION_ALIASES: Array<{ match: RegExp; terms: readonly string[] }> = [
  { match: /铁管|钢管/, terms: ["铁管", "钢管"] },
];

/**
 * These aliases are only enabled when their source term is already visible in
 * the latest DM prose.  They let the client accept an option such as “抽出
 * 纸条” after the narrative says “纸片”, without treating narrative as state
 * or inventing a new scene object.
 */
const VISIBLE_NARRATIVE_OPTION_ALIASES: Array<{ match: RegExp; terms: readonly string[] }> = [
  { match: /纸(?:条|片|张)?/, terms: ["纸", "纸条", "纸片", "纸张"] },
  { match: /裂(?:缝|纹)/, terms: ["裂缝", "裂纹"] },
  { match: /门缝/, terms: ["门缝", "房门"] },
  { match: /脚印/, terms: ["脚印"] },
  { match: /墙(?:角|面|皮|根)?/, terms: ["墙", "墙角", "墙面", "墙皮"] },
  { match: /楼梯(?:间)?/, terms: ["楼梯", "楼梯间"] },
  { match: /地毯/, terms: ["地毯"] },
  { match: /信(?:件|封)?/, terms: ["信", "信件", "信封"] },
];

function addDistinct(out: string[], value: unknown): void {
  const text = String(value ?? "").trim();
  if (!text || out.includes(text)) return;
  out.push(text);
}

/**
 * 只汇集当前客户端已经可见的场景名称，用于 options-only 质量门的文本锚定。
 * 不解码 lore 或从服务端读取额外事实。
 */
export function buildVisibleOptionsSceneAnchors(input: {
  playerLocation?: string | null;
  presentNpcIds?: string[] | null;
  equippedWeapon?: { name?: unknown } | null;
  inventoryHints?: string[] | null;
  latestNarrative?: string | null;
}): string[] {
  const out: string[] = [];
  const location = String(input.playerLocation ?? "").trim();
  if (location) {
    const label = formatLocationLabel(location);
    if (label !== "未知区域") addDistinct(out, label);
    for (const alias of LOCATION_OPTION_ALIASES[location] ?? []) addDistinct(out, alias);
  }
  for (const npcId of input.presentNpcIds ?? []) {
    const npc = NPCS.find((candidate) => candidate.id === npcId);
    if (npc) addDistinct(out, npc.name);
    for (const alias of getNpcAliases(npcId)) addDistinct(out, alias);
  }
  if (input.equippedWeapon) {
    addDistinct(out, "武器");
    addDistinct(out, input.equippedWeapon.name);
    const displayName = String(input.equippedWeapon.name ?? "");
    for (const alias of WEAPON_OPTION_ALIASES) {
      if (alias.match.test(displayName)) {
        for (const term of alias.terms) addDistinct(out, term);
      }
    }
  }
  for (const hint of input.inventoryHints ?? []) {
    const itemId = String(hint ?? "").trim();
    const item = ITEMS.find((candidate) => candidate.id === itemId);
    const displayName = item?.name ?? itemId;
    addDistinct(out, displayName);
    for (const alias of LEGACY_INVENTORY_ID_ALIASES[itemId] ?? []) addDistinct(out, alias);
    for (const alias of ITEM_OPTION_ALIASES) {
      if (alias.match.test(displayName)) {
        for (const term of alias.terms) addDistinct(out, term);
      }
    }
  }
  const narrative = String(input.latestNarrative ?? "");
  for (const alias of VISIBLE_NARRATIVE_OPTION_ALIASES) {
    if (!alias.match.test(narrative)) continue;
    for (const term of alias.terms) addDistinct(out, term);
  }
  return out.slice(0, 12);
}

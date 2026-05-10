import { NPCS } from "@/lib/registry/npcs";

export interface CanonNameWarning {
  suspectedAlias: string;
  possibleCanonName: string;
  npcId: string;
}

const ALL_CANON_NAMES = new Set(NPCS.map((n) => n.name));
const CHINESE_ALIAS_RE = /(?:小|老|阿)[\u4e00-\u9fa5]{1,2}/g;

/**
 * Scans narrative for fabricated Chinese-style aliases (小X / 老X / 阿X)
 * that don't match any canonical NPC name.
 * Only produces a warning when the scene has exactly 1 NPC whose canonical
 * name is absent from the narrative (indicating the alias likely refers to them).
 */
export function validateCanonNames(
  narrative: string,
  sceneNpcIds: string[]
): CanonNameWarning[] {
  if (!narrative || sceneNpcIds.length === 0) return [];

  const unmentionedSceneNpcs = sceneNpcIds
    .map((id) => NPCS.find((n) => n.id === id))
    .filter((npc): npc is (typeof NPCS)[number] => !!npc && !narrative.includes(npc.name));

  if (unmentionedSceneNpcs.length === 0) return [];

  const warnings: CanonNameWarning[] = [];
  const seen = new Set<string>();

  const candidates = narrative.match(CHINESE_ALIAS_RE) ?? [];
  for (const alias of candidates) {
    if (seen.has(alias)) continue;
    seen.add(alias);
    if (ALL_CANON_NAMES.has(alias)) continue;

    const isPartOfCanon = Array.from(ALL_CANON_NAMES).some(
      (name) => name.includes(alias) || alias.includes(name)
    );
    if (isPartOfCanon) continue;

    if (unmentionedSceneNpcs.length === 1) {
      warnings.push({
        suspectedAlias: alias,
        possibleCanonName: unmentionedSceneNpcs[0]!.name,
        npcId: unmentionedSceneNpcs[0]!.id,
      });
    } else {
      for (const npc of unmentionedSceneNpcs) {
        const lastChar = npc.name.charAt(npc.name.length - 1);
        const aliasChars = alias.replace(/^(?:小|老|阿)/, "");
        if (aliasChars.includes(lastChar) || lastChar === aliasChars) {
          warnings.push({
            suspectedAlias: alias,
            possibleCanonName: npc.name,
            npcId: npc.id,
          });
          break;
        }
      }
    }
  }

  return warnings;
}

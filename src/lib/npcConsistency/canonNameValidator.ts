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
  sceneNpcIds: string[],
  extraNames?: string[]
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
    if (ALL_CANON_NAMES.has(alias) || (extraNames && extraNames.includes(alias))) continue;

    const allNames = [...Array.from(ALL_CANON_NAMES), ...(extraNames ?? [])];
    const isPartOfCanon = allNames.some(
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

/**
 * Rewrites fabricated NPC aliases in the narrative with canonical names.
 * Uses conservative replacement: only replaces when the alias appears
 * in a natural name position (followed by verbs, punctuation, or sentence end).
 *
 * This is a deterministic post-generation fix — it does not mutate the
 * AI's creative choices, only corrects name hallucinations.
 */
export function rewriteNpcNameAliases(
  narrative: string,
  warnings: CanonNameWarning[]
): { narrative: string; rewrites: number } {
  if (!narrative || warnings.length === 0) return { narrative, rewrites: 0 };

  let result = narrative;
  let rewrites = 0;

  // Sort by alias length descending to avoid partial replacements
  const sorted = [...warnings].sort((a, b) => b.suspectedAlias.length - a.suspectedAlias.length);
  const replaced = new Set<string>();

  for (const w of sorted) {
    if (replaced.has(w.suspectedAlias)) continue;
    if (!result.includes(w.suspectedAlias)) continue;

    // Match alias followed by: common verbs, punctuation, or end-of-string.
    const aliasEscaped = w.suspectedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameContextRe = new RegExp(
      `${aliasEscaped}(?=[说问道喊叫笑走站坐看来去进出到跟对给把被让在是和有就还也了点回摇头转推拉开关闭听想知觉得见。，、！？：；…—])`,
      "g"
    );

    let count = 0;
    result = result.replace(nameContextRe, () => {
      count++;
      return w.possibleCanonName;
    });

    // Also replace at end of sentence/string
    if (result.endsWith(w.suspectedAlias)) {
      result = result.slice(0, -w.suspectedAlias.length) + w.possibleCanonName;
      count++;
    }

    if (count > 0) {
      rewrites += count;
      replaced.add(w.suspectedAlias);
    }
  }

  return { narrative: result, rewrites };
}

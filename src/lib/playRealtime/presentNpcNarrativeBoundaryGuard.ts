import { NPCS } from "@/lib/registry/npcs";

type RecordLike = Record<string, unknown>;

const DIRECT_PRESENCE_PATTERN = /(?:说|问|答|道|喊|递|走来|走近|站着|站在|出现|转身|看着|抬头|开口|我叫)/;
const GENERIC_ACTOR_PATTERN = /(?:女声|男声|女孩|女生|男孩|男生|姑娘|男人|女人|中年男人|大叔|陌生人|保洁阿姨|清洁工|扫地阿姨)/;
const NPC_ALIASES: Record<string, string[]> = {
  "N-008": ["老刘", "刘师傅"],
};

/**
 * Registered is not the same as present. Remove direct appearance/dialogue
 * paragraphs for actors absent from the authoritative scene snapshot.
 */
export function applyPresentNpcNarrativeBoundaryGuard(args: {
  dmRecord: RecordLike;
  clientState?: { presentNpcIds?: string[] } | null;
}): RecordLike {
  const narrative = typeof args.dmRecord.narrative === "string" ? args.dmRecord.narrative : "";
  if (!narrative) return args.dmRecord;
  const presentIds = new Set((args.clientState?.presentNpcIds ?? []).filter((id) => typeof id === "string"));
  const presentNames = new Set(NPCS.filter((npc) => presentIds.has(npc.id)).map((npc) => npc.name));
  const offscreenNames = NPCS.map((npc) => npc.name).filter((name) => !presentNames.has(name));
  const offscreenAliases = Object.entries(NPC_ALIASES)
    .filter(([id]) => !presentIds.has(id))
    .flatMap(([, aliases]) => aliases);

  let removed = 0;
  let offscreenActorChainRemaining = 0;
  const segments = (narrative.match(/[^。！？\n]*[。！？][”’"]?|[^。！？\n]+$|\n+/gu) ?? [narrative]).filter((segment) => {
    const offscreenDirect = offscreenNames.some((name) =>
      segment.includes(name) && (DIRECT_PRESENCE_PATTERN.test(segment) || /[“”]/.test(segment))
    ) || offscreenAliases.some((name) => segment.includes(name) && (DIRECT_PRESENCE_PATTERN.test(segment) || /[“”]/.test(segment)));
    const genericDirect = presentIds.size === 0 && GENERIC_ACTOR_PATTERN.test(segment) &&
      (DIRECT_PRESENCE_PATTERN.test(segment) || /[“”]/.test(segment) || /(?:脚步|扫帚|水桶|声音)/.test(segment));
    const danglingNpcDialogue = presentIds.size === 0 && /(?:他|她|对方|那人)[\s\S]{0,80}[“”]|[“”][\s\S]{0,80}(?:他|她|对方|那人)/.test(segment);
    const chainedOffscreenBeat = offscreenActorChainRemaining > 0 && (/[“”]/.test(segment) || /(?:他|她|对方|那人)/.test(segment));
    if (offscreenDirect || genericDirect || danglingNpcDialogue || chainedOffscreenBeat) {
      if (offscreenDirect || genericDirect) offscreenActorChainRemaining = 2;
      else if (offscreenActorChainRemaining > 0) offscreenActorChainRemaining -= 1;
      removed += 1;
      return false;
    }
    offscreenActorChainRemaining = 0;
    return true;
  });

  const codex = Array.isArray(args.dmRecord.codex_updates)
    ? args.dmRecord.codex_updates.filter((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return false;
        const id = (row as RecordLike).id;
        return typeof id !== "string" || !/^N-\d{3}$/i.test(id) || presentIds.has(id.toUpperCase());
      })
    : args.dmRecord.codex_updates;
  const codexRemoved = Array.isArray(args.dmRecord.codex_updates) && Array.isArray(codex) && codex.length !== args.dmRecord.codex_updates.length;
  if (removed === 0 && !codexRemoved) return args.dmRecord;

  const flags = Array.isArray(args.dmRecord._commit_flags)
    ? args.dmRecord._commit_flags.filter((flag): flag is string => typeof flag === "string")
    : [];
  return {
    ...args.dmRecord,
    narrative: segments.join("").replace(/\n{3,}/g, "\n\n").trim(),
    ...(Array.isArray(codex) ? { codex_updates: codex } : {}),
    _commit_flags: [...new Set([...flags, "offscreen_npc_presence_removed_v1"])],
  };
}

import { NPCS } from "@/lib/registry/npcs";

type RecordLike = Record<string, unknown>;

const DIRECT_PRESENCE_PATTERN = /(?:说|问|答|道|喊|递|走来|走近|站着|站在|倚在|靠在|出现|露出|打量|转身|看着|抬头|开口|我叫)/;
const GENERIC_ACTOR_PATTERN = /(?:女声|男声|女孩|女生|男孩|男生|姑娘|男人|女人|中年男人|大叔|老人|老头|老者|老太|老太太|白大褂|陌生人|保洁阿姨|清洁工|扫地阿姨|人影|身影|影子|那人|某人|一个人|有人|眼睛)/;
const DIALOGUE_QUOTE_PATTERN = /[“”‘’「」『』"']/;
const DISEMBODIED_DIALOGUE_SOURCE_PATTERN =
  /(?:(?:门后|门缝(?:里|中)?|门板(?:那头|后面|另一侧|内侧)|暗处|黑暗(?:里|中)?|墙后|房间里|走廊尽头).{0,36}(?:声音|嗓音|话音|问话|话语|低语|耳语|传来|飘出|漏出|挤出|冒出).{0,32}[“”‘’「」『』"']|(?:声音|嗓音|话音|问话|话语|低语|耳语).{0,24}(?:从)?(?:门后|门缝(?:里|中)?|门板(?:那头|后面|另一侧|内侧)|暗处|黑暗(?:里|中)?|墙后|房间里|走廊尽头).{0,24}[“”‘’「」『』"'])/u;
const NON_ACTOR_AUDIO_SOURCE_PATTERN =
  /(?:录音|广播|手机|电话|对讲机|收音机|扬声器|播放器|留声机|监控回放|语音留言)/u;
const PERSONIFIED_VOICE_DIALOGUE_PATTERN =
  /(?:[“”‘’「」『』"'][\s\S]{0,80}[“”‘’「」『』"'].{0,48}(?:一个|那道|陌生的|年轻的?|沙哑的?|低沉的?)?(?:声音|嗓音|嗓门|话音).{0,28}(?:响起|说|问|道|飘来|飘出)|(?:一个|那道|陌生的|年轻的?|沙哑的?|低沉的?)?(?:声音|嗓音|嗓门|话音).{0,40}(?:响起|说|问|道|飘来|飘出).{0,100}[“”‘’「」『』"'])/u;
const UNATTRIBUTED_SPEAKER_DIALOGUE_PATTERN =
  /[“‘「『"'][\s\S]{1,100}?[。！？][”’」』"']?\s*(?:(?:身后|背后|近处|旁边).{0,12})?(?:忽然|突然)?(?:有人|某人|那人|一个声音|一道声音|陌生的声音).{0,20}(?:说话|开口|问|说道|喊道|响起|飘来)(?:[^\n]{0,180}?[。！？][”’」』"']?)?/gu;
const ABSENT_PRONOUN_ACTION_PATTERN =
  /(?:(?:^|[。！？\s])(?:他|她|对方|那人)(?:没|未|又|正|还|也|已经|忽然|突然)?.{0,24}(?:说|问|答|道|喊|开口|转身|走|站|笑|哭)|我顺着(?:他|她|对方|那人)的(?:目光|视线))/u;
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

  const narrativeWithoutUnattributedSpeaker = presentIds.size === 0
    ? narrative.replace(UNATTRIBUTED_SPEAKER_DIALOGUE_PATTERN, "")
    : narrative;
  const narrativeWithoutPersonifiedVoice = narrativeWithoutUnattributedSpeaker;

  let removed = 0;
  let offscreenActorChainRemaining = 0;
  if (narrativeWithoutPersonifiedVoice !== narrative) removed += 1;
  const segments = (narrativeWithoutPersonifiedVoice.match(/[^。！？\n]*[。！？][”’」』"]?|[^。！？\n]+$|\n+/gu) ?? [narrativeWithoutPersonifiedVoice]).filter((segment) => {
    const offscreenDirect = offscreenNames.some((name) =>
      segment.includes(name) && (DIRECT_PRESENCE_PATTERN.test(segment) || DIALOGUE_QUOTE_PATTERN.test(segment))
    ) || offscreenAliases.some((name) => segment.includes(name) && (DIRECT_PRESENCE_PATTERN.test(segment) || DIALOGUE_QUOTE_PATTERN.test(segment)));
    const genericDirect = presentIds.size === 0 && GENERIC_ACTOR_PATTERN.test(segment) &&
      (DIRECT_PRESENCE_PATTERN.test(segment) || DIALOGUE_QUOTE_PATTERN.test(segment) || /(?:脚步|扫帚|水桶|声音)/.test(segment));
    const disembodiedDialogue = presentIds.size === 0 &&
      DISEMBODIED_DIALOGUE_SOURCE_PATTERN.test(segment) &&
      !NON_ACTOR_AUDIO_SOURCE_PATTERN.test(segment);
    const personifiedVoiceDialogue = presentIds.size === 0 &&
      PERSONIFIED_VOICE_DIALOGUE_PATTERN.test(segment) &&
      !NON_ACTOR_AUDIO_SOURCE_PATTERN.test(segment);
    const danglingNpcDialogue = presentIds.size === 0 &&
      /(?:他|她|对方|那人)[\s\S]{0,80}[“”‘’「」『』"']|[“”‘’「」『』"'][\s\S]{0,80}(?:他|她|对方|那人)/.test(segment);
    const absentPronounAction = presentIds.size === 0 && ABSENT_PRONOUN_ACTION_PATTERN.test(segment);
    const chainedOffscreenBeat = offscreenActorChainRemaining > 0 &&
      (DIALOGUE_QUOTE_PATTERN.test(segment) || /(?:他|她|对方|那人)/.test(segment));
    if (offscreenDirect || genericDirect || disembodiedDialogue || personifiedVoiceDialogue || danglingNpcDialogue || absentPronounAction || chainedOffscreenBeat) {
      if (offscreenDirect || genericDirect || disembodiedDialogue || personifiedVoiceDialogue) offscreenActorChainRemaining = 2;
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
    narrative: segments.join("").replace(/\n{3,}/g, "\n\n").trim()
      || "我停在当前地点观察，但没有在场人物可供确认或交谈；本回合没有形成可记录的人物互动。",
    ...(Array.isArray(codex) ? { codex_updates: codex } : {}),
    _commit_flags: [...new Set([...flags, "offscreen_npc_presence_removed_v1"])],
  };
}

import { NPCS } from "@/lib/registry/npcs";

type RecordLike = Record<string, unknown>;

export function applyPresentNpcObservationGuard(args: {
  dmRecord: RecordLike;
  latestUserInput: string;
  clientState?: { presentNpcIds?: string[] } | null;
}): RecordLike {
  const action = String(args.latestUserInput ?? "");
  const present = Array.isArray(args.clientState?.presentNpcIds) ? args.clientState!.presentNpcIds!.filter((id) => typeof id === "string") : [];
  let guardedRecord = args.dmRecord;
  if (present.length === 1) {
    const soleNpc = NPCS.find((row) => row.id === present[0]);
    const narrative = String(args.dmRecord.narrative ?? "");
    const genericSpeaker = /(?:一个|那个|这名|那名)?(?:中年|年轻)?(?:男人|女人|女生|男生|姑娘)(?=[^。！？\n]{0,20}(?:说|问|答|喊|看着|抬头))/g;
    if (soleNpc && genericSpeaker.test(narrative)) {
      guardedRecord = {
        ...guardedRecord,
        narrative: narrative.replace(genericSpeaker, soleNpc.name),
        _commit_flags: [...(Array.isArray(args.dmRecord._commit_flags) ? args.dmRecord._commit_flags : []), "single_present_npc_identity_repaired_v1"],
      };
    }
  }
  if (!/(观察|查看|图鉴|交谈|对话|询问|搭话)/.test(action)) return guardedRecord;
  const targetId = present.find((id) => action.includes(id)) ?? (present.length === 1 ? present[0] : null);
  if (!targetId) return guardedRecord;
  const npc = NPCS.find((row) => row.id === targetId);
  if (!npc) return guardedRecord;
  const existing = Array.isArray(guardedRecord.codex_updates) ? guardedRecord.codex_updates : [];
  const hasNpc = existing.some((raw) => raw && typeof raw === "object" && !Array.isArray(raw) && (raw as RecordLike).id === npc.id);
  const narrative = String(guardedRecord.narrative ?? "");
  if (!narrative.includes(npc.name)) return guardedRecord;
  return {
    ...guardedRecord,
    narrative,
    codex_updates: hasNpc ? existing : [...existing, { id: npc.id, name: npc.name, type: "npc", observation: "本回合已确认其在场。" }],
    _commit_flags: [...(Array.isArray(guardedRecord._commit_flags) ? guardedRecord._commit_flags : []), "present_npc_observation_committed_v1"],
  };
}

import { NPCS } from "@/lib/registry/npcs";

type DmRecord = Record<string, unknown>;

function mentionTokens(npcId: string): string[] {
  const npc = NPCS.find((row) => row.id === npcId);
  const name = String(npc?.name ?? "").trim();
  const short = name.replace(/^(电工|门卫|保安|医生|护士)/, "");
  return [npcId, name, short].filter((token) => token.length >= 2);
}

/** Prevents a dead NPC from being resurrected by generated prose. */
export function applyDeadNpcContinuityGuard(args: {
  dmRecord: DmRecord;
  latestUserInput: string;
  deadNpcIds?: readonly string[] | null;
}): DmRecord {
  const deadIds = [...new Set((args.deadNpcIds ?? []).filter(Boolean))];
  if (deadIds.length === 0) return args.dmRecord;
  const narrative = String(args.dmRecord.narrative ?? "");
  const input = String(args.latestUserInput ?? "");
  const implicated = deadIds.filter((id) => mentionTokens(id).some((token) => input.includes(token) || narrative.includes(token)));
  if (implicated.length === 0) return args.dmRecord;
  const resurrectionClaim = /(?:没死|还活着|复活|回来|站在我面前|出现在门|开口|回答|说道|说：“|嘟囔|走了?过来|呼吸声)/.test(narrative);
  const next = { ...args.dmRecord };
  next.npc_location_updates = Array.isArray(next.npc_location_updates)
    ? next.npc_location_updates.filter((row) => !row || typeof row !== "object" || Array.isArray(row) || !implicated.includes(String((row as DmRecord).id ?? "")))
    : [];
  if (resurrectionClaim) {
    next.narrative = "你对着空荡的走廊呼喊那个名字。只有灯管的电流声回应；死亡记录没有改变，也没有人从门后走出来。";
    next._commit_flags = [...(Array.isArray(next._commit_flags) ? next._commit_flags : []), "dead_npc_resurrection_blocked_v1"];
  }
  return next;
}

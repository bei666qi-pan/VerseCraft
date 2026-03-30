import type { CanonicalGender } from "@/lib/registry/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";

function clamp(s: string, max: number): string {
  const t = String(s ?? "").replace(/\\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

export type NarrativePronoun = "她" | "他" | "她们" | "他们" | "TA" | "对方";

function narrativePronounForGender(g: CanonicalGender): NarrativePronoun {
  if (g === "female") return "她";
  if (g === "male") return "他";
  if (g === "group") return "她们";
  // unknown / ambiguous / nonbinary：不让模型自由“猜他/她”，给中性落点
  return "TA";
}

function forbidOppositeForGender(g: CanonicalGender): boolean {
  return g === "female" || g === "male";
}

export function buildNpcGenderPronounPacketBlock(args: {
  focusNpcId: string | null;
  presentNpcIds: string[];
  maxChars?: number;
}): string {
  const ids: string[] = [];
  const push = (id: string | null | undefined) => {
    const t = String(id ?? "").trim();
    if (!t) return;
    const norm = t.replace(/^n-(\\d{3})$/i, "N-$1").toUpperCase();
    if (!ids.includes(norm)) ids.push(norm);
  };
  push(args.focusNpcId);
  for (const id of args.presentNpcIds ?? []) push(id);

  const rows = ids.slice(0, 8).map((npcId) => {
    const canon = getNpcCanonicalIdentity(npcId);
    return {
      npcId: canon.npcId,
      displayName: canon.canonicalName,
      canonicalGender: canon.canonicalGender,
      narrativePronoun: narrativePronounForGender(canon.canonicalGender),
      addressingStyle: clamp(canon.canonicalAddressing, 80),
      forbidOppositeGenderPronoun: forbidOppositeForGender(canon.canonicalGender),
    };
  });

  const packet = {
    schema: "npc_gender_pronoun_v1",
    note:
      "性别与代词必须服从 registry canonical identity；叙事描写/对话描写/介绍文案都不得临场改性别。未知/模糊性别用中性指代，禁止猜。",
    focusNpcId: args.focusNpcId ? args.focusNpcId.toUpperCase() : null,
    entries: rows,
  };

  const text = `## 【npc_gender_pronoun_packet】\\n${JSON.stringify(packet)}`;
  const max = Math.max(220, Math.min(1400, args.maxChars ?? 760));
  return text.length <= max ? text : `${clamp(text, max - 1)}…`;
}


import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import { NPCS } from "@/lib/registry/npcs";

type PersonaCard = {
  id: string;
  name: string;
  appearance_short: string;
  public_personality: string;
  speech_pattern: string;
  public_role: string;
  current_presence: { present: boolean; location: string | null };
  allowed_scene_presence: string[];
  first_appearance_rule: "must_use_appearance_short" | "already_written";
};

function clamp(s: string, max: number): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function uniq(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const t = String(id ?? "").trim();
    if (!t) continue;
    const norm = t.replace(/^n-(\d{3})$/i, "N-$1").toUpperCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

function fallbackSpeechPattern(npcId: string, name: string): string {
  if (npcId === "N-014") {
    return "温和家常、带后勤式关照；偶尔哼小调，话里夹着洗与晾的比喻；不快不慢，像在安抚情绪。";
  }
  return `${name}说话风格保持与其公开人格一致，避免与其他 NPC 的口癖/比喻混用。`;
}

function resolvePublicFields(npcId: string): {
  name: string;
  appearance: string;
  personality: string;
  specialty: string;
  speechPattern: string;
} {
  const prof = CORE_NPC_PROFILES_V2.find((p) => p.id === npcId) ?? null;
  if (prof) {
    return {
      name: prof.display.name,
      appearance: prof.display.appearance,
      personality: prof.display.publicPersonality,
      specialty: prof.display.specialty,
      speechPattern: prof.interaction.speechPattern,
    };
  }
  const base = NPCS.find((n) => n.id === npcId) ?? null;
  if (base) {
    return {
      name: base.name,
      appearance: base.appearance,
      personality: base.personality,
      specialty: base.specialty,
      speechPattern: fallbackSpeechPattern(npcId, base.name),
    };
  }
  return {
    name: npcId,
    appearance: "",
    personality: "",
    specialty: "",
    speechPattern: fallbackSpeechPattern(npcId, npcId),
  };
}

export function buildMultiNpcCompactPersonaPacket(args: {
  /** Candidate NPC ids: present + mentioned + focus + recent. */
  npcIds: string[];
  /** From runtime context parsing. */
  npcPositions: Array<{ npcId: string; location: string }>;
  /** Current scene location id. */
  currentLocation: string | null;
  /** From `scene_npc_appearance_written_packet` to enforce first appearance binding. */
  sceneAppearanceAlreadyWrittenIds: string[];
  /** Hard cap on included cards. */
  maxCards?: number;
  maxChars?: number;
}): string {
  const obj = buildMultiNpcCompactPersonaPacketObject(args);
  const text = `## 【multi_npc_persona_compact】\n${JSON.stringify(obj)}`;
  const maxChars = Math.max(420, Math.min(2200, args.maxChars ?? 1200));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

export function buildMultiNpcCompactPersonaPacketObject(args: {
  npcIds: string[];
  npcPositions: Array<{ npcId: string; location: string }>;
  currentLocation: string | null;
  sceneAppearanceAlreadyWrittenIds: string[];
  maxCards?: number;
}): { schema: string; instruction: string; cards: PersonaCard[] } {
  const maxCards = Math.max(2, Math.min(6, args.maxCards ?? 4));
  const ids = uniq(args.npcIds).slice(0, 12);
  const presentSet = new Set(
    args.npcPositions
      .filter((x) => x.location && args.currentLocation && x.location === args.currentLocation)
      .map((x) => String(x.npcId ?? "").replace(/^n-(\d{3})$/i, "N-$1").toUpperCase())
  );
  const written = new Set((args.sceneAppearanceAlreadyWrittenIds ?? []).map((x) => String(x ?? "").toUpperCase()));

  const cards: PersonaCard[] = [];
  for (const id of ids) {
    if (cards.length >= maxCards) break;
    const canon = getNpcCanonicalIdentity(id);
    const pub = resolvePublicFields(canon.npcId);
    const present = presentSet.has(canon.npcId);
    const firstRule: PersonaCard["first_appearance_rule"] = written.has(canon.npcId)
      ? "already_written"
      : "must_use_appearance_short";
    cards.push({
      id: canon.npcId,
      name: pub.name || canon.canonicalName || canon.npcId,
      appearance_short: clamp(canon.canonicalAppearanceShort || pub.appearance, 140),
      public_personality: clamp(pub.personality || canon.canonicalPublicPersonality, 80),
      speech_pattern: clamp(pub.speechPattern, 160),
      public_role: clamp(canon.canonicalPublicRole || pub.specialty, 120),
      current_presence: { present, location: present ? args.currentLocation : null },
      allowed_scene_presence: (canon.allowedSpawnLocations ?? []).slice(0, 5).map((x) => String(x ?? "").slice(0, 40)),
      first_appearance_rule: firstRule,
    });
  }

  const packet = {
    schema: "multi_npc_persona_compact_v1",
    instruction:
      "以下卡片是本回合高相关 NPC 的权威绑定：谁是谁、外貌锚点、语气习惯、公开职能。禁止把一个 NPC 的外貌/口癖/职能写到另一个 NPC 身上（尤其同类照料/服务型 archetype）。对白用中文引号落地，不要写“某某说：”。",
    cards,
  };
  return packet;
}

export function buildMultiNpcPersonaBoundaryPacketObject(args: {
  npcIds: string[];
  npcPositions: Array<{ npcId: string; location: string }>;
  currentLocation: string | null;
  sceneAppearanceAlreadyWrittenIds: string[];
}): {
  schema: string;
  note: string;
  cards: Array<{
    id: string;
    n: string;
    ap: string;
    sp: string;
    role: string;
    p: 0 | 1;
    fa: 0 | 1;
  }>;
} {
  const ids = uniq(args.npcIds).slice(0, 6);
  const presentSet = new Set(
    args.npcPositions
      .filter((x) => x.location && args.currentLocation && x.location === args.currentLocation)
      .map((x) => String(x.npcId ?? "").replace(/^n-(\d{3})$/i, "N-$1").toUpperCase())
  );
  const written = new Set((args.sceneAppearanceAlreadyWrittenIds ?? []).map((x) => String(x ?? "").toUpperCase()));
  const cards: Array<{ id: string; n: string; ap: string; sp: string; role: string; p: 0 | 1; fa: 0 | 1 }> = [];
  for (const id of ids) {
    if (cards.length >= 2) break;
    const canon = getNpcCanonicalIdentity(id);
    const pub = resolvePublicFields(canon.npcId);
    cards.push({
      id: canon.npcId,
      n: clamp(pub.name || canon.canonicalName || canon.npcId, 10),
      ap: clamp(canon.canonicalAppearanceShort || pub.appearance, 70),
      sp: clamp(pub.speechPattern, 70),
      role: clamp(canon.canonicalPublicRole || pub.specialty, 70),
      p: presentSet.has(canon.npcId) ? 1 : 0,
      fa: written.has(canon.npcId) ? 0 : 1,
    });
  }
  return {
    schema: "multi_npc_persona_boundary_v1",
    note: "compact binding for high-risk mixup prevention; use cards as hard anchors",
    cards,
  };
}


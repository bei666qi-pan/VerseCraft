import { NPCS } from "@/lib/registry/npcs";

const NPC_NAME_BY_ID = new Map(NPCS.map((npc) => [npc.id, npc.name]));
const NPC_NAMES = NPCS.map((npc) => npc.name).filter(Boolean);

function toSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function pickNpcNameBySeed(seedText: string): string {
  if (NPC_NAMES.length === 0) return "无名委托人";
  const idx = toSeed(seedText || String(Date.now())) % NPC_NAMES.length;
  return NPC_NAMES[idx] ?? NPC_NAMES[0] ?? "无名委托人";
}

export function normalizeIssuerName(rawIssuer: unknown, seedText: string): string {
  const issuer = typeof rawIssuer === "string" ? rawIssuer.trim() : "";
  if (!issuer) return pickNpcNameBySeed(seedText);
  if (issuer === "未知" || issuer.toLowerCase() === "unknown") {
    return pickNpcNameBySeed(seedText);
  }
  if (NPC_NAME_BY_ID.has(issuer)) return NPC_NAME_BY_ID.get(issuer) ?? pickNpcNameBySeed(seedText);
  if (NPC_NAMES.includes(issuer)) return issuer;
  return pickNpcNameBySeed(seedText);
}

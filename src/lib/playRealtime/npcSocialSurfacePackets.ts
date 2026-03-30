/**
 * 同场 NPC 关系 → 紧凑 runtime packet，供 DM 写对白与微表演（非玩家 UI）。
 */
import { lookupNpcNameById } from "@/lib/registry/codexDisplay";
import { NPC_RELATIONAL_SURFACE_EDGES, type NpcRelationalSurfaceEdge } from "@/lib/registry/npcRelationalSurface";

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

const EDGE_BY_PAIR: ReadonlyMap<string, NpcRelationalSurfaceEdge> = (() => {
  const m = new Map<string, NpcRelationalSurfaceEdge>();
  for (const e of NPC_RELATIONAL_SURFACE_EDGES) {
    m.set(pairKey(e.a, e.b), e);
  }
  return m;
})();

function displayName(id: string): string {
  return lookupNpcNameById(id) ?? id;
}

/** 单行表演提示（中文，限长） */
export function buildRelationalPerformativeLine(e: NpcRelationalSurfaceEdge): string {
  const na = displayName(e.a);
  const nb = displayName(e.b);
  const bits: string[] = [];
  if (e.knowsEachOther) bits.push("老相识");
  if (e.mutualTrust === "high") bits.push("信得过");
  else if (e.mutualTrust === "low") bits.push("表面客气");
  if (e.publicFriction === "mid") bits.push("话里带刺");
  if (e.jokingMode) bits.push("能斗嘴");
  if (e.avoidanceMode) bits.push("少提对方");
  bits.push(e.whenPlayerPresentBehavior);
  const core = `${na}↔${nb}:${bits.join("，")}`;
  return core.length <= 120 ? core : `${core.slice(0, 117)}…`;
}

export type NpcSocialSurfacePacketCompact = {
  schema: 1;
  /** 表演提示：勿当数据库逐条念，只取语气与微动作 */
  lines: string[];
};

export function buildNpcSocialSurfacePacketCompact(nearbyNpcIds: string[], maxLines = 5): NpcSocialSurfacePacketCompact | null {
  const ids = [...new Set(nearbyNpcIds.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length < 2) return null;
  const lines: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const edge = EDGE_BY_PAIR.get(pairKey(ids[i]!, ids[j]!));
      if (!edge) continue;
      lines.push(buildRelationalPerformativeLine(edge));
      if (lines.length >= maxLines) return { schema: 1, lines };
    }
  }
  return lines.length > 0 ? { schema: 1, lines } : null;
}

/** 塞进单 NPC 心脏视图：与哪些同场者有表层默契 */
export function buildPeerRelationalCuesForNpc(focalNpcId: string, presentNpcIds: string[] | undefined, maxPeers = 2): string {
  const focal = String(focalNpcId ?? "").trim();
  const peers = [...new Set((presentNpcIds ?? []).map((x) => String(x).trim()).filter((x) => x && x !== focal))];
  if (peers.length === 0) return "";
  const cues: string[] = [];
  for (const p of peers) {
    const edge = EDGE_BY_PAIR.get(pairKey(focal, p));
    if (!edge) continue;
    const otherName = displayName(p);
    const nick = edge.nameShortcutStyle.trim().slice(0, 14);
    const hint = [
      nick ? `当面叫「${nick}」` : "",
      edge.mentionStyle.slice(0, 18),
      edge.whenPlayerPresentBehavior.slice(0, 32),
    ]
      .filter(Boolean)
      .join("｜");
    cues.push(`${otherName}:${hint}`);
    if (cues.length >= maxPeers) break;
  }
  const out = cues.join("；");
  return out.length <= 140 ? out : `${out.slice(0, 137)}…`;
}

import { normalizeForHash } from "@/lib/kg/normalize";
import type { ConflictDecision } from "./detectConflicts";

export interface MergeChunkDraft {
  entityType: string;
  code: string;
  canonicalName: string;
  summary: string;
  detail: string;
  scope: "global" | "user" | "session";
  ownerUserId: string | null;
  status: string;
  sourceType: string;
  tags: string[];
  chunkContent: string;
  retrievalKey: string;
  conflictStatus: string | null;
}

export function mergeKnowledgeChunk(decisions: ConflictDecision[]): MergeChunkDraft[] {
  const map = new Map<string, MergeChunkDraft>();
  for (const d of decisions) {
    if (d.action !== "allow_private") continue;
    const fact = d.fact;
    const scope = fact.scope === "session_fact" ? "session" : "user";
    const ownerUserId = fact.userId ?? null;
    const sessionId = fact.sessionId ?? "none";
    const code = `player:${ownerUserId ?? "anonymous"}:${normalizeForHash(fact.normalized).slice(0, 40)}`;
    const retrievalKey =
      scope === "session" ? `session:${sessionId}:${fact.normalized.slice(0, 96)}` : `user:${ownerUserId ?? "none"}:${fact.normalized.slice(0, 96)}`;
    const dedupeKey = `${scope}:${ownerUserId ?? "none"}:${retrievalKey}`;
    if (map.has(dedupeKey)) continue;
    map.set(dedupeKey, {
      entityType: "player_fact",
      code,
      canonicalName: "玩家事实",
      summary: fact.text.slice(0, 160),
      detail: fact.text.slice(0, 1000),
      scope,
      ownerUserId,
      status: d.status === "conflicted_core" ? "conflicted" : "active",
      sourceType: "turn_writeback",
      tags: [...new Set([...fact.entityHints, fact.source, "player_fact"])].slice(0, 8),
      chunkContent: fact.text.slice(0, 1000),
      retrievalKey,
      conflictStatus: d.status === "none" ? null : d.status,
    });
  }
  return [...map.values()];
}

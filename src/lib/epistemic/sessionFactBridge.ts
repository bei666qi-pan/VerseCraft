/**
 * 会话压缩记忆中的分层摘要 → KnowledgeFact（无 lore 检索时仍可检测泄密）。
 */

import { coerceToEpistemicMemory, sessionMemoryRowLooksPresent, type SessionMemoryRow } from "@/lib/memoryCompress";
import { PLAYER_ACTOR_ID, type KnowledgeFact } from "./types";

export function sessionMemoryRowToKnowledgeFacts(row: SessionMemoryRow | null, nowIso: string): KnowledgeFact[] {
  if (!row || !sessionMemoryRowLooksPresent(row)) return [];
  const ep = coerceToEpistemicMemory(row);
  if (!ep) return [];
  const out: KnowledgeFact[] = [];
  if (ep.player_known_summary?.trim()) {
    out.push({
      id: "session:player_known_summary",
      content: ep.player_known_summary.trim(),
      scope: "player",
      sourceType: "memory",
      certainty: "confirmed",
      visibleTo: [PLAYER_ACTOR_ID],
      inferableByOthers: false,
      tags: ["session", "player_known"],
      createdAt: nowIso,
    });
  }
  if (ep.dm_only_truth_summary?.trim()) {
    out.push({
      id: "session:dm_only_truth",
      content: ep.dm_only_truth_summary.trim(),
      scope: "world",
      sourceType: "system_canon",
      certainty: "confirmed",
      visibleTo: [],
      inferableByOthers: false,
      tags: ["session", "dm_truth"],
      createdAt: nowIso,
    });
  }
  if (ep.public_plot_summary?.trim()) {
    out.push({
      id: "session:public_plot",
      content: ep.public_plot_summary.trim(),
      scope: "public",
      sourceType: "memory",
      certainty: "confirmed",
      visibleTo: [],
      inferableByOthers: true,
      tags: ["session", "public"],
      createdAt: nowIso,
    });
  }
  if (ep.scene_public_state?.trim()) {
    out.push({
      id: "session:scene_public_state",
      content: ep.scene_public_state.trim(),
      scope: "shared_scene",
      sourceType: "observation",
      certainty: "confirmed",
      visibleTo: [],
      inferableByOthers: true,
      tags: ["session", "scene"],
      createdAt: nowIso,
    });
  }
  return out;
}

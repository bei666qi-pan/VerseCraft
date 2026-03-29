/**
 * 会话压缩层 → 认知组装用快照（无 DB、无网络；供后续按 NPC 拼 prompt）。
 */

import type { EpistemicCompressedMemory } from "@/lib/memoryCompress";
import type { NpcEpistemicSnapshotMin } from "./types";

export type EpistemicMemorySnapshot = {
  publicLayer: {
    plotSummary?: string;
    sceneState?: string;
    recentEvents?: string[];
    rumors?: string[];
  };
  playerLayer: {
    knownSummary?: string;
    hiddenFlags?: string[];
    privateEvents?: Record<string, string[]>;
  };
  /** 系统真相，勿与 npcById 混用 */
  dmOnlyTruth?: string;
  npcById: Record<string, NpcEpistemicSnapshotMin>;
  emotionalMarkers?: Array<{ actorId?: string; note: string }>;
};

export function buildEpistemicMemorySnapshot(ep: EpistemicCompressedMemory): EpistemicMemorySnapshot {
  const npcById: Record<string, NpcEpistemicSnapshotMin> = {};
  for (const s of ep.npc_epistemic_snapshots ?? []) {
    npcById[s.npcId] = s;
  }
  return {
    publicLayer: {
      plotSummary: ep.public_plot_summary,
      sceneState: ep.scene_public_state,
      recentEvents: ep.recent_public_events,
      rumors: ep.unresolved_rumors,
    },
    playerLayer: {
      knownSummary: ep.player_known_summary,
      hiddenFlags: ep.player_hidden_flags,
      privateEvents: ep.recent_private_events_by_actor,
    },
    dmOnlyTruth: ep.dm_only_truth_summary,
    npcById,
    emotionalMarkers: ep.emotional_residue_markers,
  };
}

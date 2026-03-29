/**
 * 阶段 4：按「当前发言 NPC」权限化组装会话记忆块，避免把全局 DM 摘要当台词素材。
 */

import { buildNpcEpistemicProfile } from "./builders";
import { canActorKnowFact, filterFactsForActor } from "./guards";
import type { EpistemicResiduePromptPacket } from "./residuePerformance";
import type { EpistemicAnomalyResult, EpistemicSceneContext, KnowledgeFact, NpcEpistemicProfile } from "./types";
import type { SessionMemoryForDm } from "@/lib/memoryCompress";

export type ActorScopedMemoryCaps = {
  summaryMaxChars?: number;
  playerStatusMaxChars?: number;
  npcRelationsMaxChars?: number;
  layerMaxChars?: number;
  npcSnapshotsMaxChars?: number;
  actorKnownFactsMax?: number;
  actorKnownContentMax?: number;
  compact?: boolean;
};

export type BuildActorScopedEpistemicInput = {
  mem: SessionMemoryForDm | null;
  actorNpcId: string | null;
  presentNpcIds: string[];
  allKnowledgeFacts?: KnowledgeFact[];
  profile?: NpcEpistemicProfile | null;
  anomalyResult?: EpistemicAnomalyResult | null;
  /** 本回合玩法向残响标签包（与事实权限分离） */
  residuePacket?: EpistemicResiduePromptPacket | null;
  /** 本回合是否跑过认知越界检测（有焦点 NPC 且非开局约束） */
  detectorRan?: boolean;
  options?: ActorScopedMemoryCaps;
  nowIso?: string;
};

export type ActorScopedMemoryMetrics = {
  epistemicFactCount: number;
  actorKnownFactCount: number;
  publicFactCount: number;
  anomalySeverity: "none" | "low" | "medium" | "high";
  validatorTriggered: boolean;
  blockChars: number;
  globalLegacyShadowChars: number;
  promptCharsDelta: number;
};

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function applyCompactCaps(o: ActorScopedMemoryCaps | undefined): ActorScopedMemoryCaps {
  const c = o?.compact ? 0.55 : 1;
  return {
    summaryMaxChars: Math.max(80, Math.floor((o?.summaryMaxChars ?? 1200) * c)),
    playerStatusMaxChars: Math.max(60, Math.floor((o?.playerStatusMaxChars ?? 420) * c)),
    npcRelationsMaxChars: Math.max(50, Math.floor((o?.npcRelationsMaxChars ?? 200) * c)),
    layerMaxChars: Math.max(50, Math.floor((o?.layerMaxChars ?? 480) * c)),
    npcSnapshotsMaxChars: Math.max(60, Math.floor((o?.npcSnapshotsMaxChars ?? 320) * c)),
    actorKnownFactsMax: o?.actorKnownFactsMax ?? (o?.compact ? 8 : 14),
    actorKnownContentMax: o?.actorKnownContentMax ?? (o?.compact ? 56 : 80),
    compact: o?.compact,
  };
}

/** 旧版「全局注入」字符数估计（仅用于 telemetry delta，不进入 prompt） */
export function estimateGlobalUnscopedMemoryBlockChars(
  mem: SessionMemoryForDm | null,
  options?: ActorScopedMemoryCaps
): number {
  return buildGlobalUnscopedMemoryBlockLegacy(mem, options).length;
}

function buildGlobalUnscopedMemoryBlockLegacy(mem: SessionMemoryForDm | null, options?: ActorScopedMemoryCaps): string {
  if (!mem) return "";
  const caps = applyCompactCaps(options);
  const layerMax = caps.layerMaxChars!;
  const summaryMaxChars = caps.summaryMaxChars!;
  const playerStatusMaxChars = caps.playerStatusMaxChars!;
  const npcRelationsMaxChars = caps.npcRelationsMaxChars!;
  const npcSnapMax = caps.npcSnapshotsMaxChars!;
  const parts: string[] = ["", "## 【动态记忆（分层·认知权限）】", "", "【规则】", ""];
  if (mem.public_plot_summary?.trim()) parts.push("【公共可见叙事上限】", clip(mem.public_plot_summary.trim(), layerMax), "");
  if (mem.scene_public_state?.trim()) parts.push("【场景公开状态】", clip(mem.scene_public_state.trim(), layerMax), "");
  if (mem.recent_public_events?.length) parts.push("【近期公共事件】", clip(mem.recent_public_events.join("；"), layerMax), "");
  if (mem.unresolved_rumors?.length) parts.push("【未证实传闻】", clip(mem.unresolved_rumors.join("；"), layerMax), "");
  parts.push(
    "【玩家状态快照】",
    clip(JSON.stringify(mem.player_status ?? {}, null, 0), playerStatusMaxChars),
    "",
    "【NPC 关系快照】",
    clip(JSON.stringify(mem.npc_relationships ?? {}, null, 0), npcRelationsMaxChars),
    ""
  );
  if (mem.plot_summary?.trim()) parts.push("【DM 编排摘要】", clip(mem.plot_summary.trim(), summaryMaxChars), "");
  if (mem.dm_only_truth_summary?.trim()) parts.push("【系统层真相】", clip(mem.dm_only_truth_summary.trim(), layerMax), "");
  if (mem.player_known_summary?.trim()) parts.push("【玩家已知】", clip(mem.player_known_summary.trim(), layerMax), "");
  if (mem.player_hidden_flags?.length) parts.push("【玩家侧未公开标记】", clip(mem.player_hidden_flags.join("；"), layerMax), "");
  if (mem.recent_private_events_by_actor && Object.keys(mem.recent_private_events_by_actor).length) {
    parts.push("【分主体私域事件】", clip(JSON.stringify(mem.recent_private_events_by_actor, null, 0), layerMax), "");
  }
  if (mem.npc_epistemic_snapshots?.length) {
    parts.push("【NPC 认知轻量快照】", clip(JSON.stringify(mem.npc_epistemic_snapshots, null, 0), npcSnapMax), "");
  }
  if (mem.emotional_residue_markers?.length) {
    parts.push("【情绪残响标记】", clip(JSON.stringify(mem.emotional_residue_markers, null, 0), layerMax), "");
  }
  return parts.join("\n");
}

function pickRelationForActor(mem: SessionMemoryForDm | null, actorId: string): Record<string, unknown> {
  if (!mem?.npc_relationships) return {};
  const nr = mem.npc_relationships;
  const keys = [actorId, actorId.toUpperCase(), actorId.toLowerCase()];
  for (const k of keys) {
    if (k in nr) return { [k]: nr[k] };
  }
  for (const [k, v] of Object.entries(nr)) {
    if (String(k).toUpperCase() === actorId.toUpperCase()) return { [k]: v };
  }
  return {};
}

function filterMarkersForActor(
  mem: SessionMemoryForDm | null,
  actorId: string
): Array<{ actorId?: string; note: string }> {
  const raw = mem?.emotional_residue_markers ?? [];
  return raw.filter((m) => !m.actorId || m.actorId === actorId);
}

export function buildActorScopedEpistemicMemoryBlock(input: BuildActorScopedEpistemicInput): {
  block: string;
  metrics: ActorScopedMemoryMetrics;
} {
  const mem = input.mem;
  const caps = applyCompactCaps(input.options);
  const actorId = input.actorNpcId?.trim() || null;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const facts = input.allKnowledgeFacts ?? [];
  const scene: EpistemicSceneContext = {
    presentNpcIds: [...new Set([...(input.presentNpcIds ?? []), ...(actorId ? [actorId] : [])])],
  };

  const actorKnown = actorId ? filterFactsForActor(facts, actorId, scene, { nowIso }) : [];
  const publicFactCount = facts.filter(
    (f) =>
      (f.scope === "public" || f.scope === "shared_scene") &&
      (actorId ? canActorKnowFact(f, actorId, scene, { nowIso }) : true)
  ).length;

  const profile = actorId ? (input.profile ?? buildNpcEpistemicProfile(actorId)) : null;
  const anomaly = input.anomalyResult ?? null;

  const lines: string[] = [
    "",
    "## 【actor_epistemic_scoped_packet】",
    "【边界】下列字段为「当前 actor 视角允许参考的上限」；未列出者默认该 actor 不知，不得在对白中自然确认。系统/全局摘要≠角色已知。",
    "",
  ];

  if (!actorId) {
    lines.push("focus_npc:none", "mode:scene_or_soliloquy", "");
    if (mem?.public_plot_summary?.trim()) {
      lines.push("public_plot:", clip(mem.public_plot_summary.trim(), caps.layerMaxChars!), "");
    }
    if (mem?.scene_public_state?.trim()) {
      lines.push("scene_public:", clip(mem.scene_public_state.trim(), caps.layerMaxChars!), "");
    }
    if (mem?.recent_public_events?.length) {
      lines.push("recent_public:", clip(mem.recent_public_events.join("；"), caps.layerMaxChars!), "");
    }
    if (mem?.unresolved_rumors?.length) {
      lines.push("rumors:", clip(mem.unresolved_rumors.join("；"), caps.layerMaxChars!), "");
    }
    lines.push(
      "player_mechanics:",
      clip(JSON.stringify(mem?.player_status ?? {}, null, 0), Math.min(caps.playerStatusMaxChars!, 220)),
      "",
      "omit_from_actor_view: plot_summary,dm_only_truth,player_known,player_hidden,full_npc_rel_snapshots,other_npc_private",
      ""
    );
  } else {
    lines.push(`focus_npc:${actorId}`, "");
    if (profile) {
      lines.push(
        "cognitive_profile:",
        JSON.stringify({
          remembersPlayerIdentity: profile.remembersPlayerIdentity,
          remembersPastLoops: profile.remembersPastLoops,
          retainsEmotionalResidue: profile.retainsEmotionalResidue,
          isXinlanException: profile.isXinlanException,
        }),
        ""
      );
    }
    if (input.residuePacket) {
      lines.push(
        "npc_epistemic_residue_packet:",
        clip(JSON.stringify(input.residuePacket), Math.min(920, caps.summaryMaxChars! + 120)),
        ""
      );
    }
    const snap = mem?.npc_epistemic_snapshots?.find((s) => s.npcId === actorId);
    if (snap) {
      lines.push(
        "npc_session_snapshot:",
        clip(JSON.stringify(snap, null, 0), caps.npcSnapshotsMaxChars!),
        ""
      );
    }
    if (mem?.public_plot_summary?.trim()) {
      lines.push("public_plot:", clip(mem.public_plot_summary.trim(), caps.layerMaxChars!), "");
    }
    if (mem?.scene_public_state?.trim()) {
      lines.push("scene_public:", clip(mem.scene_public_state.trim(), caps.layerMaxChars!), "");
    }
    if (mem?.recent_public_events?.length) {
      lines.push("recent_public:", clip(mem.recent_public_events.join("；"), caps.layerMaxChars!), "");
    }
    if (mem?.unresolved_rumors?.length) {
      lines.push("rumors:", clip(mem.unresolved_rumors.join("；"), caps.layerMaxChars!), "");
    }

    const knownLines = actorKnown.slice(0, caps.actorKnownFactsMax!).map((f) => ({
      id: f.id,
      c: clip(f.content, caps.actorKnownContentMax!),
    }));
    lines.push("actor_known_facts:", clip(JSON.stringify(knownLines, null, 0), caps.summaryMaxChars!), "");

    const rel = pickRelationForActor(mem, actorId);
    lines.push(
      "relations_this_npc_only:",
      clip(JSON.stringify(rel, null, 0), caps.npcRelationsMaxChars!),
      ""
    );
    lines.push(
      "player_mechanics:",
      clip(JSON.stringify(mem?.player_status ?? {}, null, 0), caps.playerStatusMaxChars!),
      ""
    );

    const markers = filterMarkersForActor(mem, actorId);
    if (markers.length) {
      lines.push("emotional_residue_markers:", clip(JSON.stringify(markers, null, 0), caps.layerMaxChars!), "");
    }

    lines.push(
      "omit_from_this_actor: plot_summary,dm_only_truth,player_known,player_hidden,other_npcs_snapshots,global_rel_map",
      ""
    );

    if (anomaly?.anomaly) {
      lines.push(
        `cognitive_alert:active severity=${anomaly.severity} style=${anomaly.reactionStyle} tags=${anomaly.requiredBehaviorTags.slice(0, 5).join("|")}`,
        "cognitive_alert_detail: 完整 mustInclude/mustAvoid 见 control 段 npc_epistemic_alert_packet JSON",
        ""
      );
    }
  }

  const block = lines.join("\n");
  const globalLegacyShadowChars = estimateGlobalUnscopedMemoryBlockChars(mem, input.options);
  const metrics: ActorScopedMemoryMetrics = {
    epistemicFactCount: facts.length,
    actorKnownFactCount: actorKnown.length,
    publicFactCount,
    anomalySeverity: anomaly?.anomaly ? anomaly.severity : "none",
    validatorTriggered: Boolean(actorId && input.detectorRan),
    blockChars: block.length,
    globalLegacyShadowChars,
    promptCharsDelta: globalLegacyShadowChars - block.length,
  };

  return { block, metrics };
}

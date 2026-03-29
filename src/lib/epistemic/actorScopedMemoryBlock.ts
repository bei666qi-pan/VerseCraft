/**
 * 阶段 4：按「当前发言 NPC」权限化组装会话记忆块，避免把全局 DM 摘要当台词素材。
 */

import { buildActorScopedEpistemicContext, buildNpcEpistemicProfile } from "./builders";
import { canActorKnowFact, filterFactsForActor, forbiddenFactsForActor } from "./guards";
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
  /** 与 runtime reveal_tier_packet 对齐 */
  maxRevealRank?: number;
  /** 指向同条 system 内 JSON：baseline / scene_authority / key_npc */
  runtimeCrossRefNote?: string;
  /** registry 职能壳一行，防身份漂移 */
  actorCanonOneLiner?: string;
  /** false 时降级为占位块（灰度 VERSECRAFT_ENABLE_ACTOR_SCOPED_EPISTEMIC=0） */
  actorScopedEpistemicEnabled?: boolean;
};

export type ActorScopedMemoryMetrics = {
  epistemicFactCount: number;
  actorKnownFactCount: number;
  publicFactCount: number;
  forbiddenFactCount: number;
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
  const scopedOn = input.actorScopedEpistemicEnabled !== false;

  if (!scopedOn) {
    const globalLegacyShadowChars = estimateGlobalUnscopedMemoryBlockChars(mem, input.options);
    const stub = [
      "",
      "## 【actor_epistemic_scoped_packet】",
      "rollout:actor_scoped_epistemic_disabled",
      "instruction: 分层记忆裁剪已关闭（灰度）；仍以同条 system 的 npc_consistency_boundary_compact 与其它 JSON 为权威，不得越权认知。",
      "",
      "player_mechanics:",
      clip(JSON.stringify(mem?.player_status ?? {}, null, 0), Math.min(caps.playerStatusMaxChars ?? 420, 200)),
      "",
    ].join("\n");
    return {
      block: stub,
      metrics: {
        epistemicFactCount: input.allKnowledgeFacts?.length ?? 0,
        actorKnownFactCount: 0,
        publicFactCount: 0,
        forbiddenFactCount: 0,
        anomalySeverity: "none",
        validatorTriggered: false,
        blockChars: stub.length,
        globalLegacyShadowChars,
        promptCharsDelta: globalLegacyShadowChars - stub.length,
      },
    };
  }

  const actorId = input.actorNpcId?.trim() || null;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const facts = input.allKnowledgeFacts ?? [];
  const scene: EpistemicSceneContext = {
    presentNpcIds: [...new Set([...(input.presentNpcIds ?? []), ...(actorId ? [actorId] : [])])],
  };

  const actorKnown = actorId ? filterFactsForActor(facts, actorId, scene, { nowIso }) : [];
  const forbiddenFactCount = actorId ? forbiddenFactsForActor(facts, actorId, scene, { nowIso }).length : 0;
  const publicFactCount = facts.filter(
    (f) =>
      (f.scope === "public" || f.scope === "shared_scene") &&
      (actorId ? canActorKnowFact(f, actorId, scene, { nowIso }) : true)
  ).length;

  const profile = actorId ? (input.profile ?? buildNpcEpistemicProfile(actorId)) : null;
  const anomaly = input.anomalyResult ?? null;
  const maxRevealRank = typeof input.maxRevealRank === "number" && Number.isFinite(input.maxRevealRank) ? input.maxRevealRank : 0;

  const layers = buildActorScopedEpistemicContext({
    actorId,
    scene,
    memory: mem,
    allFacts: facts,
    profile,
    maxRevealRank,
    nowIso,
    runtimeCrossRefNote: input.runtimeCrossRefNote,
    actorCanonOneLiner: input.actorCanonOneLiner,
  });

  const lines: string[] = [
    "",
    "## 【actor_epistemic_scoped_packet】",
    "【边界】下列为分层上下文；未列出者默认不知。系统/全局摘要≠角色已知。runtime 结构化包见 runtimeCrossRef。",
    "",
    "runtime_cross_ref:",
    clip(layers.runtimeCrossRefNote || "npc_player_baseline_packet,npc_scene_authority_packet,key_npc_lore_packet@同条system JSON", caps.layerMaxChars!),
    "",
    layers.worldTruthOmittedNote,
    "",
    "layer_public_plot:",
    clip(layers.publicPlotLayer, caps.layerMaxChars!),
    "",
    "layer_scene_public:",
    clip(layers.scenePublicLayer, caps.layerMaxChars!),
    "",
    "layer_recent_public:",
    clip(layers.recentPublicLayer, caps.layerMaxChars!),
    "",
    "layer_rumors_unconfirmed:",
    clip(layers.rumorsLayer, caps.layerMaxChars!),
    "",
    layers.playerKnownExcludedNote,
    "",
    "layer_emotional_residue:",
    clip(layers.residueLayer, caps.layerMaxChars!),
    "",
    layers.revealGateNote,
    "",
  ];

  if (layers.actorCanonOneLiner?.trim()) {
    lines.push("actor_canon_shell:", clip(layers.actorCanonOneLiner.trim(), caps.layerMaxChars!), "");
  }

  if (!actorId) {
    lines.push("focus_npc:none", "mode:scene_or_soliloquy", "");
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
    lines.push(
      "forbidden_fact_ids_hint:",
      clip(layers.forbiddenFactsSummary, 220),
      ""
    );
    if (layers.actorPrivateFactsLine.trim()) {
      lines.push(
        "actor_private_fact_contents:",
        clip(layers.actorPrivateFactsLine, caps.summaryMaxChars!),
        ""
      );
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
    forbiddenFactCount,
    anomalySeverity: anomaly?.anomaly ? anomaly.severity : "none",
    validatorTriggered: Boolean(actorId && input.detectorRan),
    blockChars: block.length,
    globalLegacyShadowChars,
    promptCharsDelta: globalLegacyShadowChars - block.length,
  };

  return { block, metrics };
}

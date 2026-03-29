/**
 * 认知对象构建辅助（阶段 1）：与 store / route 弱耦合，便于单测与渐进接线。
 */

import type { SessionMemoryForDm } from "@/lib/memoryCompress";
import {
  DM_ACTOR_ID,
  PLAYER_ACTOR_ID,
  type ActorScopedEpistemicContextLayers,
  type EmotionalResidueMode,
  type EpistemicContext,
  type EpistemicRuntimeRefs,
  type EpistemicSceneContext,
  type KnowledgeFact,
  type NpcEpistemicProfile,
} from "./types";
import { applyEpistemicRolloutToProfile } from "./featureFlags";
import { buildNpcEpistemicProfileFromPolicy } from "./policy";
import { buildActorPrivateKnownFacts, buildForbiddenKnowledgeList } from "./filter";
import { canActorKnowFact, filterFactsForActor, forbiddenFactsForActor } from "./guards";

export type BuildNpcEpistemicProfileDeps = {
  overrides?: Partial<NpcEpistemicProfile>;
};

/** 阶段 1：runtimeContext 预留，与 revealTier / packet 对齐时填入 refs */
export type EpistemicRuntimeContext = {
  revealTierRank?: number;
  runtimePacketKeys?: string[];
};

export function buildNpcEpistemicProfile(
  npcId: string,
  deps?: BuildNpcEpistemicProfileDeps,
  _runtimeContext?: EpistemicRuntimeContext
): NpcEpistemicProfile {
  void _runtimeContext;
  const o = deps?.overrides;
  const { npcId: _nid, isXinlanException: _ix, ...memoryOverrides } = (o ?? {}) as Partial<NpcEpistemicProfile>;
  const base = buildNpcEpistemicProfileFromPolicy(npcId, memoryOverrides);
  return applyEpistemicRolloutToProfile(base);
}

/**
 * 从场景事件生成公共事实（示例工厂；调用方可逐步替换为真实事件源）。
 */
export function buildPublicSceneFacts(args: {
  sceneId: string;
  summaries: string[];
  nowIso: string;
  visibleTo?: string[];
}): KnowledgeFact[] {
  const vis = args.visibleTo ?? [];
  return args.summaries.map((content, i) => ({
    id: `scene:${args.sceneId}:pub:${i}`,
    content: content.trim(),
    scope: "public",
    sourceType: "observation",
    certainty: "confirmed",
    visibleTo: vis,
    inferableByOthers: true,
    tags: ["scene", "public"],
    createdAt: args.nowIso,
  }));
}

/**
 * 将已有事实池中属于某 NPC 的部分筛出（不创造新命题）。
 */
export function buildNpcKnownFacts(npcId: string, allFacts: KnowledgeFact[], scene: EpistemicSceneContext, nowIso?: string): KnowledgeFact[] {
  return filterFactsForActor(allFacts, String(npcId).trim(), scene, { nowIso });
}

export function buildPlayerKnownFacts(allFacts: KnowledgeFact[], scene: EpistemicSceneContext, nowIso?: string): KnowledgeFact[] {
  return filterFactsForActor(allFacts, PLAYER_ACTOR_ID, scene, { nowIso });
}

/**
 * 情绪残响 ≠ 具体事实：默认 NPC 仅有 mood；欣蓝在身份/周目策略上可有 anchor，仍不应与「任意 world 事实」等同。
 */
export function getNpcEmotionalResidueMode(profile: NpcEpistemicProfile): EmotionalResidueMode {
  if (!profile.retainsEmotionalResidue) {
    return "none";
  }
  if (profile.isXinlanException && (profile.remembersPlayerIdentity === "exact" || profile.remembersPastLoops)) {
    return "mood_plus_identity_anchor";
  }
  return "mood_only";
}

export function buildEpistemicContextForActor(args: {
  actorId: string;
  allFacts: KnowledgeFact[];
  scene: EpistemicSceneContext;
  refs?: EpistemicRuntimeRefs;
  nowIso?: string;
}): EpistemicContext {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const { actorId, allFacts, scene, refs } = args;
  const allowed = filterFactsForActor(allFacts, actorId, scene, { nowIso });
  const forbidden = forbiddenFactsForActor(allFacts, actorId, scene, { nowIso });

  const playerKnown = filterFactsForActor(allFacts, PLAYER_ACTOR_ID, scene, { nowIso });
  const publicScene = allFacts.filter((f) => f.scope === "public" || f.scope === "shared_scene");
  const inferred = allFacts.filter((f) => f.scope === "inferred");

  const npcKnown =
    actorId !== PLAYER_ACTOR_ID && actorId !== DM_ACTOR_ID
      ? filterFactsForActor(allFacts, actorId, scene, { nowIso })
      : [];

  return {
    actorId,
    playerKnownFacts: playerKnown,
    npcKnownFacts: npcKnown,
    publicSceneFacts: publicScene.filter((f) => canActorKnowFact(f, actorId, scene, { nowIso })),
    inferredFacts: inferred.filter((f) => canActorKnowFact(f, actorId, scene, { nowIso })),
    forbiddenFacts: forbidden,
    refs: refs
      ? {
          revealTierRank: refs.revealTierRank,
          runtimePacketKeys: refs.runtimePacketKeys,
        }
      : undefined,
  };
}

/**
 * 将认知配置挂到 NpcHeart 运行时视图（可选字段，由调用方在 selectors 之后赋值）。
 */
export function attachEpistemicProfileToHeartView<T extends { epistemicProfile?: NpcEpistemicProfile }>(
  view: T,
  npcId: string,
  deps?: BuildNpcEpistemicProfileDeps,
  runtime?: EpistemicRuntimeContext
): T & { epistemicProfile: NpcEpistemicProfile } {
  return {
    ...view,
    epistemicProfile: buildNpcEpistemicProfile(npcId, deps, runtime),
  };
}

function clipLayer(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * 情绪残响层：与命题事实分离；高魅力/欣蓝仅增强提示强度，不等于真相包。
 */
export function buildEmotionalResidueHints(
  mem: SessionMemoryForDm | null,
  actorId: string | null,
  profile: NpcEpistemicProfile | null
): string {
  const markers = (mem?.emotional_residue_markers ?? []).filter(
    (m) => !m.actorId || (actorId && m.actorId === actorId)
  );
  const band = profile?.retainsEmotionalResidue
    ? profile.isXinlanException
      ? "欣蓝：牵引感可强，仍禁止单回合全盘真相"
      : "特权 NPC：熟悉感/警惕，不得写成可核对记忆"
    : "普通 NPC：仅模糊体感";
  const notes = markers.map((m) => m.note).filter(Boolean);
  return clipLayer([band, ...notes].join("；"), 400);
}

/**
 * 组装 actor 视角分层上下文（供 actor_epistemic 段注入，不替代 runtime JSON 包）。
 */
export function buildActorScopedEpistemicContext(args: {
  actorId: string | null;
  scene: EpistemicSceneContext;
  memory: SessionMemoryForDm | null;
  allFacts: KnowledgeFact[];
  profile: NpcEpistemicProfile | null;
  maxRevealRank: number;
  nowIso: string;
  runtimeCrossRefNote?: string;
  actorCanonOneLiner?: string;
}): ActorScopedEpistemicContextLayers {
  const { actorId, memory, scene, allFacts, profile, maxRevealRank, nowIso } = args;
  const worldTruthOmittedNote = "【世界真实层】plot_summary / dm_only_truth 仅 DM 编排；禁止当成本 actor 已知台词。";
  const scopedRow =
    actorId && memory?.actor_scoped_memory_snapshots?.length
      ? memory.actor_scoped_memory_snapshots.find((s) => s.npcId === actorId)
      : undefined;
  const publicPlotLayer = clipLayer(
    [memory?.public_plot_summary ?? "", scopedRow?.scopedNarrativeHint ? `actor_hint:${scopedRow.scopedNarrativeHint}` : ""]
      .filter((x) => x.trim())
      .join(" | "),
    480
  );
  const scenePublicLayer = clipLayer(memory?.scene_public_state ?? "", 360);
  const playerKnownExcludedNote =
    "【玩家已知层】不注入 NPC 对白上下文（防读剧本）；玩家独知不得自然泄露。";
  const recentPublicLayer = clipLayer((memory?.recent_public_events ?? []).join("；"), 400);
  const rumorsLayer = clipLayer((memory?.unresolved_rumors ?? []).join("；"), 400);
  const residueLayer = buildEmotionalResidueHints(memory, actorId, profile);

  let actorPrivateFactsLine = "";
  let forbiddenFactsSummary = "";
  if (actorId) {
    const priv = buildActorPrivateKnownFacts(allFacts, actorId, scene, { nowIso });
    actorPrivateFactsLine = clipLayer(
      priv
        .slice(0, 14)
        .map((f) => `${f.id}:${clipLayer(f.content, 72)}`)
        .join(" | "),
      560
    );
    const forb = buildForbiddenKnowledgeList(allFacts, actorId, scene, { nowIso });
    forbiddenFactsSummary = clipLayer(
      forb
        .slice(0, 12)
        .map((f) => f.id)
        .join(","),
      220
    );
    const idxKeys = memory?.npc_private_memory_index?.[actorId];
    if (idxKeys?.length) {
      const hint = clipLayer(idxKeys.slice(0, 10).join(","), 120);
      actorPrivateFactsLine = clipLayer(
        actorPrivateFactsLine.trim() ? `${actorPrivateFactsLine} | mem_key_hints:${hint}` : `mem_key_hints:${hint}`,
        560
      );
    }
  }

  const revealRefs = (memory?.reveal_tier_sensitive_facts ?? []).slice(0, 8);
  const revealExtra =
    revealRefs.length > 0
      ? ` gated_refs:${revealRefs.map((r) => `${r.id}≥${r.minRevealRank}`).join(",")}`
      : "";
  const revealGateNote = `【揭露门闸】maxRevealRank=${maxRevealRank}；reveal_tier_sensitive_facts 与 runtime reveal_tier_packet 对齐前不得跳深层身份。${revealExtra}`;

  return {
    worldTruthOmittedNote,
    publicPlotLayer,
    scenePublicLayer,
    recentPublicLayer,
    playerKnownExcludedNote,
    rumorsLayer,
    residueLayer,
    actorPrivateFactsLine,
    forbiddenFactsSummary,
    revealGateNote,
    runtimeCrossRefNote: args.runtimeCrossRefNote ?? "",
    actorCanonOneLiner: args.actorCanonOneLiner,
  };
}

/**
 * 认知对象构建辅助（阶段 1）：与 store / route 弱耦合，便于单测与渐进接线。
 */

import {
  DM_ACTOR_ID,
  PLAYER_ACTOR_ID,
  type EmotionalResidueMode,
  type EpistemicContext,
  type EpistemicRuntimeRefs,
  type EpistemicSceneContext,
  type KnowledgeFact,
  type NpcEpistemicProfile,
} from "./types";
import { applyEpistemicRolloutToProfile } from "./featureFlags";
import { buildNpcEpistemicProfileFromPolicy } from "./policy";
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

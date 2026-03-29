/**
 * Actor 上下文过滤：重新导出 guards + 记忆层策略。
 */

import type { EpistemicSceneContext, KnowledgeFact, NpcEpistemicProfile } from "./types";
import { filterFactsForActor, forbiddenFactsForActor } from "./guards";

export { canActorKnowFact, filterFactsForActor, forbiddenFactsForActor } from "./guards";

/** 玩家独知层默认不进入 NPC actor 提示（防读剧本） */
export function shouldOmitPlayerKnownSummaryForNpcActor(_profile: NpcEpistemicProfile | null): boolean {
  void _profile;
  return true;
}

export function buildActorPrivateKnownFacts(
  facts: KnowledgeFact[],
  actorId: string,
  scene: EpistemicSceneContext,
  options?: { nowIso?: string }
): KnowledgeFact[] {
  return filterFactsForActor(facts, actorId, scene, options);
}

export function buildForbiddenKnowledgeList(
  facts: KnowledgeFact[],
  actorId: string,
  scene: EpistemicSceneContext,
  options?: { nowIso?: string }
): KnowledgeFact[] {
  return forbiddenFactsForActor(facts, actorId, scene, options);
}

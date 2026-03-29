/**
 * 认知可读性判定与事实过滤（纯函数，无副作用）。
 */

import { DM_ACTOR_ID, PLAYER_ACTOR_ID, type EpistemicSceneContext, type KnowledgeFact } from "./types";
import type { NpcEpistemicProfile } from "./types";

function isExpired(fact: KnowledgeFact, nowIso: string): boolean {
  const exp = fact.expiresAt;
  if (!exp || !String(exp).trim()) return false;
  try {
    return new Date(exp).getTime() < new Date(nowIso).getTime();
  } catch {
    return false;
  }
}

/**
 * 判断某 actor 是否可将该事实视为「认知上可引用」（非叙事质量，仅权限模型）。
 * - DM：可见除纯玩家私域外的所有事实（用于编排）；玩家私域仍可见以便防剧透编排。
 */
export function canActorKnowFact(
  fact: KnowledgeFact,
  actorId: string,
  scene: EpistemicSceneContext,
  options?: { nowIso?: string }
): boolean {
  const now = options?.nowIso ?? new Date().toISOString();
  if (isExpired(fact, now)) return false;

  const actor = String(actorId ?? "").trim();
  if (actor === DM_ACTOR_ID) {
    return true;
  }

  if (fact.visibleTo.length > 0) {
    return fact.visibleTo.includes(actor);
  }

  switch (fact.scope) {
    case "world":
      return false;
    case "public":
      return true;
    case "player":
      return actor === PLAYER_ACTOR_ID;
    case "npc": {
      const owner = String(fact.ownerId ?? "").trim();
      return owner.length > 0 && actor === owner;
    }
    case "shared_scene":
      return actor === PLAYER_ACTOR_ID || scene.presentNpcIds.includes(actor);
    case "inferred":
      if (fact.inferableByOthers) {
        return actor === PLAYER_ACTOR_ID || scene.presentNpcIds.includes(actor);
      }
      if (fact.ownerId && actor === String(fact.ownerId).trim()) {
        return true;
      }
      return actor === PLAYER_ACTOR_ID;
    default:
      return false;
  }
}

export function filterFactsForActor(
  facts: KnowledgeFact[],
  actorId: string,
  scene: EpistemicSceneContext,
  options?: { nowIso?: string }
): KnowledgeFact[] {
  return facts.filter((f) => canActorKnowFact(f, actorId, scene, options));
}

/**
 * 对当前 actor 而言「禁止当作 NPC 自己知道」的事实（用于后续 prompt 负向提示或告警）。
 * 返回仍包含 world 与「他 NPC 私域」事实。
 */
export function forbiddenFactsForActor(
  facts: KnowledgeFact[],
  actorId: string,
  scene: EpistemicSceneContext,
  options?: { nowIso?: string }
): KnowledgeFact[] {
  return facts.filter((f) => !canActorKnowFact(f, actorId, scene, options));
}

/**
 * 结合 NPC 策略：是否允许该 NPC 在叙事中「认出」玩家身份精度。
 * 与 KnowledgeFact 无关，供 builders / 后续 prompt 使用。
 */
export function npcMayUseIdentityPrecision(profile: NpcEpistemicProfile): boolean {
  return profile.remembersPlayerIdentity === "exact" || profile.remembersPlayerIdentity === "vague";
}

/**
 * 是否允许结构化「周目/循环」记忆（非情绪残响）。
 */
export function npcMayReferencePastLoops(profile: NpcEpistemicProfile): boolean {
  return profile.remembersPastLoops === true;
}

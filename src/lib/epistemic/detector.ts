/**
 * 认知越界检测：规则 + 字符串重叠（无额外模型调用）。
 */

import { canActorKnowFact, forbiddenFactsForActor } from "./guards";
import type {
  EpistemicAlertSeverity,
  EpistemicAnomalyResult,
  EpistemicReactionHint,
  EpistemicSceneContext,
  KnowledgeFact,
  NpcEpistemicProfile,
} from "./types";

function normalizeMention(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 玩家输入是否包含事实正文的足够长子串（中文按字） */
export function inputMentionsFactContent(input: string, factContent: string, minLen = 5): boolean {
  const ni = normalizeMention(input);
  const fc = factContent.replace(/\s+/g, "").trim();
  if (fc.length < minLen) return false;
  const maxWin = Math.min(28, fc.length);
  for (let len = maxWin; len >= minLen; len--) {
    const step = len > 12 ? Math.max(1, Math.floor(len / 3)) : 1;
    for (let i = 0; i + len <= fc.length; i += step) {
      const chunk = fc.slice(i, i + len).toLowerCase();
      if (ni.includes(chunk)) return true;
    }
  }
  return false;
}

/**
 * 若命中了「禁止事实」，但玩家措辞已被 NPC 可知的公共/同场景事实充分覆盖，则降级为不误判。
 */
function isExplainedByNpcKnowablePublicLayer(
  uniq: KnowledgeFact[],
  npcId: string,
  scene: EpistemicSceneContext,
  playerInput: string,
  forbiddenFact: KnowledgeFact,
  nowIso: string
): boolean {
  const fn = normalizeMention(forbiddenFact.content);
  if (fn.length < 5) return false;
  for (const p of uniq) {
    if (!canActorKnowFact(p, npcId, scene, { nowIso })) continue;
    if (p.scope !== "public" && p.scope !== "shared_scene") continue;
    if (!inputMentionsFactContent(playerInput, p.content)) continue;
    const pn = normalizeMention(p.content);
    if (pn.length >= 5 && fn.includes(pn)) return true;
  }
  return false;
}

export function emptyEpistemicAnomalyResult(npcId: string): EpistemicAnomalyResult {
  return {
    anomaly: false,
    npcId,
    severity: "low",
    reactionStyle: "confused",
    triggerFactIds: [],
    requiredBehaviorTags: [],
    forbiddenResponseTags: [],
    mustInclude: [],
    mustAvoid: [],
  };
}

function emptyResult(npcId: string): EpistemicAnomalyResult {
  return emptyEpistemicAnomalyResult(npcId);
}

function buildAnomalyFromTriggered(
  npcId: string,
  triggered: KnowledgeFact[],
  profile: NpcEpistemicProfile
): EpistemicAnomalyResult {
  const triggerFactIds = triggered.map((t) => t.id).slice(0, 12);
  const hasPlayerSecret = triggered.some((t) => t.scope === "player" || t.tags?.includes("user_private"));
  const hasOtherNpcPrivate = triggered.some(
    (t) => t.scope === "npc" && String(t.ownerId ?? "").toUpperCase() !== npcId.toUpperCase()
  );
  const hasWorld = triggered.some((t) => t.scope === "world" || t.sourceType === "system_canon");

  let severity: EpistemicAlertSeverity = "medium";
  let reactionStyle: EpistemicReactionHint = "confused";

  if (hasPlayerSecret || hasOtherNpcPrivate) {
    severity = "high";
    reactionStyle = "suspicious";
  } else if (hasWorld) {
    if (profile.isXinlanException) {
      severity = "medium";
      reactionStyle = "defensive";
    } else if (profile.remembersPlayerIdentity === "none" && !profile.remembersPastLoops) {
      // 典型路人/无身份记忆：对系统级泄露以不适、听岔为主，少做刑侦式追问
      severity = "medium";
      reactionStyle = "confused";
    } else {
      severity = "high";
      reactionStyle = "suspicious";
    }
  }

  const residueOnly =
    !profile.isXinlanException &&
    profile.remembersPlayerIdentity === "none" &&
    !profile.remembersPastLoops &&
    profile.retainsEmotionalResidue;

  const requiredBehaviorTags: string[] = [];
  const forbiddenResponseTags: string[] = ["confirm_secret_out_of_nowhere", "recite_hidden_canon"];
  const mustAvoid = ["直接确认隐秘事实", "主动解释全貌", "替玩家补齐其未公开的推理链细节"];
  const mustInclude: string[] = [];

  if (reactionStyle === "suspicious") {
    mustInclude.push("停顿", "追问来源、语境或反问对方为何提起");
    requiredBehaviorTags.push("probe_source", "hesitation");
  } else if (reactionStyle === "defensive") {
    mustInclude.push("迂回、自我保护式措辞", "不把话说死");
    requiredBehaviorTags.push("guard_boundary", "partial_ack");
  } else {
    mustInclude.push("不理解或听岔", "把话题拉回当下可见事物");
    requiredBehaviorTags.push("mishear_or_deflect");
  }

  if (residueOnly) {
    mustInclude.push("可夹杂莫名熟悉或不安", "不给可当场核对的具体细节或名单");
    mustAvoid.push("准确复述玩家独知专有名词链");
    forbiddenResponseTags.push("precise_secret_detail");
  }
  if (residueOnly && reactionStyle === "confused") {
    mustInclude.push("仅表现为莫名熟悉/不安/迟疑");
  }

  if (profile.isXinlanException) {
    mustInclude.push("可写牵引感或既视感", "仍不得一口说尽根因/全员真相");
    forbiddenResponseTags.push("omniscient_recap");
  }

  return {
    anomaly: true,
    npcId,
    severity,
    reactionStyle,
    triggerFactIds,
    requiredBehaviorTags,
    forbiddenResponseTags,
    mustInclude,
    mustAvoid,
  };
}

export function detectEpistemicAnomaly(input: {
  npcId: string;
  playerInput: string;
  allFacts: KnowledgeFact[];
  scene: EpistemicSceneContext;
  profile: NpcEpistemicProfile;
  nowIso?: string;
}): EpistemicAnomalyResult {
  const npcId = String(input.npcId ?? "").trim();
  if (!npcId) return emptyResult("");

  const nowIso = input.nowIso ?? new Date().toISOString();
  const uniqMap = new Map<string, KnowledgeFact>();
  for (const f of input.allFacts) {
    uniqMap.set(f.id, f);
  }
  const uniq = [...uniqMap.values()];

  const forbidden = forbiddenFactsForActor(uniq, npcId, input.scene, { nowIso });
  let triggered = forbidden.filter((f) => inputMentionsFactContent(input.playerInput, f.content));
  triggered = triggered.filter(
    (f) => !isExplainedByNpcKnowablePublicLayer(uniq, npcId, input.scene, input.playerInput, f, nowIso)
  );

  if (triggered.length === 0) {
    return emptyResult(npcId);
  }

  return buildAnomalyFromTriggered(npcId, triggered, input.profile);
}

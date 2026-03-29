/**
 * 认知越界检测：规则 + 字符串重叠（无额外模型调用）。
 */

import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import type { NpcCanonicalIdentity } from "@/lib/registry/types";
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
    forbiddenBehaviorTags: [],
    mustInclude: [],
    mustAvoid: [],
  };
}

function emptyResult(npcId: string): EpistemicAnomalyResult {
  return attachForbiddenBehaviorTags(emptyEpistemicAnomalyResult(npcId));
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
    forbiddenBehaviorTags: forbiddenResponseTags,
    mustInclude,
    mustAvoid,
  };
}

function attachForbiddenBehaviorTags(r: EpistemicAnomalyResult): EpistemicAnomalyResult {
  return { ...r, forbiddenBehaviorTags: r.forbiddenBehaviorTags ?? r.forbiddenResponseTags };
}

export type CognitiveAnomalyDetectorInput = {
  npcId: string;
  playerInput: string;
  allFacts: KnowledgeFact[];
  scene: EpistemicSceneContext;
  profile: NpcEpistemicProfile;
  nowIso?: string;
  maxRevealRank?: number;
  canonical?: NpcCanonicalIdentity | null;
};

function mergeAnomalyResults(a: EpistemicAnomalyResult, b: EpistemicAnomalyResult): EpistemicAnomalyResult {
  const sev: EpistemicAlertSeverity =
    a.severity === "high" || b.severity === "high"
      ? "high"
      : a.severity === "medium" || b.severity === "medium"
        ? "medium"
        : "low";
  const fr = [...new Set([...a.forbiddenResponseTags, ...b.forbiddenResponseTags])];
  return {
    anomaly: true,
    npcId: a.npcId,
    severity: sev,
    reactionStyle: b.reactionStyle !== "confused" ? b.reactionStyle : a.reactionStyle,
    triggerFactIds: [...new Set([...a.triggerFactIds, ...b.triggerFactIds])].slice(0, 16),
    requiredBehaviorTags: [...new Set([...a.requiredBehaviorTags, ...b.requiredBehaviorTags])].slice(0, 16),
    forbiddenResponseTags: fr.slice(0, 16),
    forbiddenBehaviorTags: fr.slice(0, 16),
    mustInclude: [...new Set([...a.mustInclude, ...b.mustInclude])].slice(0, 12),
    mustAvoid: [...new Set([...a.mustAvoid, ...b.mustAvoid])].slice(0, 12),
  };
}

/**
 * 玩家输入层规则：旧识措辞 / 深层真相抢跑（与事实池检测互补）。
 */
function detectPlayerInputRuleSignals(input: CognitiveAnomalyDetectorInput): EpistemicAnomalyResult | null {
  const npcId = String(input.npcId ?? "").trim();
  if (!npcId) return null;
  const canon = input.canonical ?? getNpcCanonicalIdentity(npcId);
  const priv = canon.memoryPrivilege;
  const privileged = priv === "xinlan" || priv === "major_charm" || priv === "night_reader";

  const OLD_FRIEND = /老相识|老朋友|又见面了|咱俩|当年一起|还记得我吗|旧友|老队友/;
  if (!privileged && OLD_FRIEND.test(input.playerInput)) {
    return {
      ...emptyEpistemicAnomalyResult(npcId),
      anomaly: true,
      severity: "medium",
      reactionStyle: "guarded",
      triggerFactIds: ["rule:player_input_old_friend_language"],
      requiredBehaviorTags: ["probe_source", "keep_distance"],
      forbiddenResponseTags: ["warm_old_friend_recognition"],
      forbiddenBehaviorTags: ["warm_old_friend_recognition"],
      mustInclude: ["反问对方为何用旧识口吻", "把话题拉回当下场景"],
      mustAvoid: ["顺势认下旧关系", "回忆具体共事细节"],
    };
  }

  const mr = input.maxRevealRank ?? 0;
  const DEEP = /七锚.*闭环|循环.*真相|读档.*世界|校源.*根因|纠错链.*全貌/;
  if (mr < REVEAL_TIER_RANK.deep && priv === "normal" && DEEP.test(input.playerInput)) {
    return {
      ...emptyEpistemicAnomalyResult(npcId),
      anomaly: true,
      severity: "high",
      reactionStyle: "suspicious",
      triggerFactIds: ["rule:player_input_deep_truth_premature"],
      requiredBehaviorTags: ["disbelief", "probe_source"],
      forbiddenResponseTags: ["confirm_loop_canon"],
      forbiddenBehaviorTags: ["confirm_loop_canon"],
      mustInclude: ["表示听不懂或把话头截断", "追问对方从哪听来的"],
      mustAvoid: ["顺势补齐循环/校源设定"],
    };
  }

  return null;
}

/**
 * 认知异常检测（阶段6）：事实池 forbidden + 玩家输入规则层；供生成前 prompt / alert 包。
 */
export function detectCognitiveAnomaly(input: CognitiveAnomalyDetectorInput): EpistemicAnomalyResult {
  const base = detectEpistemicAnomaly(input);
  const rule = detectPlayerInputRuleSignals(input);
  if (!rule) return base;
  if (!base.anomaly) return rule;
  return mergeAnomalyResults(base, rule);
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
    return attachForbiddenBehaviorTags(emptyResult(npcId));
  }

  return attachForbiddenBehaviorTags(buildAnomalyFromTriggered(npcId, triggered, input.profile));
}

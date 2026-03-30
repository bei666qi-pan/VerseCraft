/**
 * 阶段7：校源揭露节奏 — 防抢跑、防 hint 变答案、防非欣蓝替盘深层真相（规则层）。
 */

import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { MAJOR_NPC_SCHOOL_REVEAL_LADDERS } from "@/lib/registry/majorNpcRevealLadder";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";

export type ForeshadowValidatorResult = {
  leakDetected: boolean;
  leakType: string | null;
  severity: "none" | "low" | "high";
  rewriteNeeded: boolean;
};

const ANSWER_DECLARATION_RE = /校源确认|深层校籍|全员真相链|纠错链(?:的)?全貌|读档(?:的)?世界真相/;
const DEEP_OMNI_RE = /七锚.*闭环|闭环.*七锚|根因就是(?:你|这)|耶里(?:高中|附中)/;

/** 欣蓝在低档：仍拦「硬答案句」，但放行单独职能词，避免误杀登记壳叙事 */
const XINLAN_STRICT_LEAK_RE = /校源确认|耶里|辅锚|七锚|闭环真相|纠错链|读档世界|档案干事残留|辅锚之三/;

function isMajorId(id: string | null): id is MajorNpcId {
  return Boolean(id && (MAJOR_NPC_IDS as readonly string[]).includes(id));
}

function uniqueAllNeverLeakTokens(): string[] {
  const s = new Set<string>();
  for (const ladder of Object.values(MAJOR_NPC_SCHOOL_REVEAL_LADDERS)) {
    for (const w of ladder.neverLeakBeforeDeep) {
      if (w.trim().length >= 2) s.add(w.trim());
    }
  }
  return [...s];
}

let _cachedUnion: string[] | null = null;
function allNeverLeakUnion(): string[] {
  if (!_cachedUnion) _cachedUnion = uniqueAllNeverLeakTokens();
  return _cachedUnion;
}

function narrativeHitsToken(narrative: string, token: string): boolean {
  if (!token) return false;
  return narrative.includes(token);
}

export function validateForeshadowNarrative(input: {
  narrative: string;
  focusNpcId: string | null;
  maxRevealRank: RevealTierRank;
  isXinlan: boolean;
  /** false 时欣蓝按 N-010 全量 neverLeak 拦（更严、更少牵引容错） */
  xinlanRevealSpecialCase?: boolean;
}): ForeshadowValidatorResult {
  const n = String(input.narrative ?? "");
  if (!n.trim() || input.maxRevealRank >= REVEAL_TIER_RANK.deep) {
    return { leakDetected: false, leakType: null, severity: "none", rewriteNeeded: false };
  }

  if (ANSWER_DECLARATION_RE.test(n) || DEEP_OMNI_RE.test(n)) {
    return {
      leakDetected: true,
      leakType: "answer_declaration_or_omnibus",
      severity: "high",
      rewriteNeeded: true,
    };
  }

  const id = input.focusNpcId;
  const xinlanSpecial = input.xinlanRevealSpecialCase !== false;

  if (input.isXinlan && !xinlanSpecial) {
    const ladder = MAJOR_NPC_SCHOOL_REVEAL_LADDERS["N-010"];
    for (const w of ladder.neverLeakBeforeDeep) {
      if (narrativeHitsToken(n, w)) {
        return {
          leakDetected: true,
          leakType: `xinlan_full_ladder_ban:${w}`,
          severity: "high",
          rewriteNeeded: true,
        };
      }
    }
    return { leakDetected: false, leakType: null, severity: "none", rewriteNeeded: false };
  }

  if (input.isXinlan && xinlanSpecial) {
    if (XINLAN_STRICT_LEAK_RE.test(n)) {
      return {
        leakDetected: true,
        leakType: "xinlan_strict_school_leak",
        severity: "high",
        rewriteNeeded: true,
      };
    }
    return { leakDetected: false, leakType: null, severity: "none", rewriteNeeded: false };
  }

  if (isMajorId(id)) {
    const ladder = MAJOR_NPC_SCHOOL_REVEAL_LADDERS[id];
    for (const w of ladder.neverLeakBeforeDeep) {
      if (narrativeHitsToken(n, w)) {
        return {
          leakDetected: true,
          leakType: `banned_token:${w}`,
          severity: "high",
          rewriteNeeded: true,
        };
      }
    }
    return { leakDetected: false, leakType: null, severity: "none", rewriteNeeded: false };
  }

  /** 非高魅力焦点：任意校源禁词出现即视为抢跑（保守） */
  for (const w of allNeverLeakUnion()) {
    if (narrativeHitsToken(n, w)) {
      return {
        leakDetected: true,
        leakType: `ambient_banned_token:${w}`,
        severity: "high",
        rewriteNeeded: true,
      };
    }
  }

  return { leakDetected: false, leakType: null, severity: "none", rewriteNeeded: false };
}

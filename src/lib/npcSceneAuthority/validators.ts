/**
 * 场景权威校验：与 memory 摘要、生成文本、揭露档位对齐。
 */

import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { locationsMatch, normalizeLocationKey } from "@/lib/registry/npcCanonBuilders";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import type {
  NpcAppearanceValidationResult,
  NpcLocationValidationResult,
  NpcRoleLeakValidationResult,
  NpcSceneAuthorityPacket,
} from "./types";

const DEEP_LEAK_PATTERNS: Array<{ re: RegExp; token: string }> = [
  { re: /耶里学校|耶里校|校源闭环|七辅锚|七锚|旧七人阵|泡层纠错/i, token: "school_cycle_deep" },
  { re: /学籍|校籍|教务处档案/i, token: "ye_li_registry" },
];

/**
 * memory 摘要中的位置命题若与权威坐标冲突 → 警告（以权威为准）。
 */
export function validateNpcLocationConsistency(args: {
  authoritySceneLocation: string | null;
  memorySummarySnippet?: string | null;
}): NpcLocationValidationResult {
  const warnings: string[] = [];
  const auth = args.authoritySceneLocation ? normalizeLocationKey(args.authoritySceneLocation) : "";
  const mem = (args.memorySummarySnippet ?? "").trim();
  if (!auth || !mem) return { ok: true, warnings };

  const locMentions = mem.match(/用户位置[：:]\s*([^\s；。]+)/);
  if (locMentions?.[1]) {
    const m = normalizeLocationKey(locMentions[1]);
    if (m && !locationsMatch(m, auth)) {
      warnings.push(`memory 中的位置暗示「${m}」与权威场景「${auth}」不一致；叙事以权威为准。`);
    }
  }
  return { ok: warnings.length === 0, warnings };
}

/**
 * 外貌文本应与 canonical 高度重合；明显偏离则警告（防漂移）。
 */
export function validateNpcAppearanceConsistency(args: {
  npcId: string;
  proposedAppearance: string;
  canonicalShort: string;
  canonicalLong: string;
}): NpcAppearanceValidationResult {
  const p = args.proposedAppearance.trim().slice(0, 400);
  const s = args.canonicalShort.trim();
  const l = args.canonicalLong.trim();
  if (!p) {
    return {
      ok: true,
      warnings: [],
      suggestion: "use_canonical_short",
    };
  }
  const overlap =
    s.length > 0 ? (p.includes(s.slice(0, Math.min(12, s.length))) ? 1 : 0) : 0;
  const overlapL = l.length > 0 ? (p.includes(l.slice(0, Math.min(12, l.length))) ? 1 : 0) : 0;
  if (overlap === 0 && overlapL === 0 && p.length > 8) {
    return {
      ok: false,
      warnings: [`${args.npcId} 外貌描写与 canonical 锚点偏离，可能漂移。`],
      suggestion: "use_canonical_long",
    };
  }
  return { ok: true, warnings: [], suggestion: "use_canonical_short" };
}

/**
 * 档位不足时若叙事出现深层词槽 → 判为泄漏风险（供后处理/telemetry）。
 */
export function validateNpcRoleLeakByRevealTier(args: {
  npcId: string;
  maxRevealRank: RevealTierRank;
  narrativeSnippet: string;
  packet?: NpcSceneAuthorityPacket | null;
}): NpcRoleLeakValidationResult {
  const cap = getNpcCanonicalIdentity(args.npcId).revealTierCap;
  const deepOk = args.maxRevealRank >= REVEAL_TIER_RANK.deep && cap >= REVEAL_TIER_RANK.deep;
  const locked = args.packet?.npcDeepRoleLockedMap[args.npcId] ?? !deepOk;
  if (!locked) return { ok: true };

  const blocked: string[] = [];
  for (const { re, token } of DEEP_LEAK_PATTERNS) {
    if (re.test(args.narrativeSnippet)) blocked.push(token);
  }
  if (blocked.length === 0) return { ok: true };
  return {
    ok: false,
    blockedTokens: blocked,
    reason: "深层校源语义在档位或 npcDeepRoleLocked 未许可时出现。",
  };
}

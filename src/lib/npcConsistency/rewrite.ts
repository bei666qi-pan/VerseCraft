/**
 * 阶段6：叙事层降级改写（无二次大模型），供 npcConsistency validator 调用。
 */

import { appendSoftHedge, rewriteNarrativeHeavyLeak } from "@/lib/epistemic/rewrite";

/** 阶段7：soft task 误写成系统腔时的轻量替换（不重算 JSON） */
export function scrubTaskUiSurfacePhrases(narrative: string): string {
  let t = String(narrative ?? "");
  t = t.replace(/你已接取[^。]{0,36}任务/g, "话头像是递给你一根线，还没勒成结");
  t = t.replace(/系统提示[：:][^。]{0,48}/g, "空气里像掠过一声无机质的提示，又迅速散掉");
  return t;
}

function normalizeId(id: string): string {
  return String(id ?? "")
    .trim()
    .replace(/^n-(\d{3})$/i, "N-$1")
    .toUpperCase();
}

/**
 * 将不在场 NPC 的对白替换为通用归属（身侧有人/环境描述），
 * 从根源上阻止离场 NPC「开口说话」，而非仅追加脚注。
 */
export function rewriteNarrativeOffscreenDialogue(
  narrative: string,
  presentNpcIds: string[],
): string {
  const present = new Set(presentNpcIds.map(normalizeId).filter(Boolean));
  const re = /\b(N-\d{3})\b/gi;
  let matched = false;
  let changed = false;

  const result = narrative.replace(re, (match) => {
    const id = normalizeId(match);
    if (!id) return match;
    matched = true;
    if (!present.has(id)) {
      changed = true;
      return "身侧有人";
    }
    return match;
  });

  if (changed) return result;
  // 有 NPC ID 命中但全在场 → 无需改写，原样返回。
  if (matched) return narrative;

  // 兜底：如果正则未命中（不应发生，调用方已通过 findOffscreenNpcDialogueViolations 检测），
  // 仍追加脚注作为最后保护。
  const t = narrative.trim();
  if (!t) return t;
  return `${t}\n\n（话声像从远处折回，你确认开口的仍是眼前在场的人。）`;
}

export function rewriteNarrativeOldFriendLeak(narrative: string): string {
  return rewriteNarrativeHeavyLeak(narrative, "overreach_acceptance");
}

export function rewriteNarrativeLoopTruthLeak(narrative: string): string {
  return rewriteNarrativeHeavyLeak(narrative, "world_truth_premature");
}

export function softenNarrativeWithHedge(narrative: string): string {
  return appendSoftHedge(narrative);
}

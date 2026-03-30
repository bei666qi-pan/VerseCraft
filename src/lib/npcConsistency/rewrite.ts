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

export function rewriteNarrativeOffscreenDialogue(narrative: string): string {
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

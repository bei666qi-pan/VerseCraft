/**
 * 阶段6：叙事层降级改写（无二次大模型），供 npcConsistency validator 调用。
 */

import { appendSoftHedge, rewriteNarrativeHeavyLeak } from "@/lib/epistemic/rewrite";

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

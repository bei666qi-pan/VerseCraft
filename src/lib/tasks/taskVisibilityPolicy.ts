import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { inferEffectiveNarrativeLayer } from "@/lib/tasks/taskRoleModel";

export type TaskVisibilityTier =
  | "hidden"
  | "clue_only"
  | "promise_only"
  | "board_visible";

/**
 * 2026-07 重构：移除 grantState，可见性纯从 status 与 narrativeLayer 派生。
 */
export function getTaskVisibilityTier(t: GameTaskV2): TaskVisibilityTier {
  if (!t) return "hidden";
  if (t.status === "hidden") return "hidden";

  const layer = inferEffectiveNarrativeLayer(t);

  if (layer === "soft_lead") {
    return "clue_only";
  }

  if (layer === "conversation_promise") {
    if (t.status === "active" || t.status === "available") return "promise_only";
    return "hidden";
  }

  // formal_task: board-visible unless hidden
  if (t.status === "active" || t.status === "available") return "board_visible";
  if (t.status === "completed" || t.status === "failed") return "board_visible";
  return "hidden";
}

export function isVisibleOnBoard(t: GameTaskV2): boolean {
  return getTaskVisibilityTier(t) === "board_visible";
}

export function isVisibleInPromiseLane(t: GameTaskV2): boolean {
  return getTaskVisibilityTier(t) === "promise_only";
}

export function isVisibleAsClue(t: GameTaskV2): boolean {
  return getTaskVisibilityTier(t) === "clue_only";
}

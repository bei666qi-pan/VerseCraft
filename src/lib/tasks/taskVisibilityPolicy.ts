import type { GameTaskV2, TaskGrantState } from "@/lib/tasks/taskV2";
import { inferEffectiveNarrativeLayer, type TaskNarrativeLayerKind } from "@/lib/tasks/taskRoleModel";

export type TaskVisibilityTier =
  | "hidden"
  | "clue_only"
  | "promise_only"
  | "board_visible";

function grantRank(s: TaskGrantState | undefined): number {
  if (!s) return 0;
  if (s === "archived_hidden") return -10;
  if (s === "discovered_but_unoffered") return 0;
  if (s === "narratively_offered") return 1;
  if (s === "accepted_in_story") return 2;
  if (s === "soft_tracked") return 2;
  if (s === "visible_on_board") return 3;
  return 0;
}

export function taskNarrativeLayerOf(t: Pick<GameTaskV2, "taskNarrativeLayer" | "shouldStayAsSoftLead" | "shouldStayAsConversationPromise" | "shouldBeFormalTask" | "goalKind" | "promiseBinding" | "type" | "guidanceLevel">): TaskNarrativeLayerKind {
  return inferEffectiveNarrativeLayer(t);
}

/**
 * 阶段 3：统一可见性判定（客户端任务板消费）。
 * 规则目标：
 * - soft_lead: 默认不进任务板主视图（只作为线索/影子存在）
 * - conversation_promise: 可轻追踪，但不抢主视图
 * - formal_task: 只有“叙事授予 + 叙事接下”后才可进入正式任务状态
 */
export function getTaskVisibilityTier(t: GameTaskV2): TaskVisibilityTier {
  if (!t) return "hidden";
  if (t.status === "hidden") return "hidden";
  if (t.grantState === "archived_hidden") return "hidden";

  const layer = inferEffectiveNarrativeLayer(t);
  const r = grantRank(t.grantState);

  if (layer === "soft_lead") {
    // 线索不是任务：永远不进主板
    return "clue_only";
  }

  if (layer === "conversation_promise") {
    // 承诺/风险：需要至少被叙事提出，或被标为 soft_tracked
    if (t.status === "active") return "promise_only";
    return r >= 1 ? "promise_only" : "hidden";
  }

  // formal_task
  // 必须 accepted_in_story（或显式 visible_on_board）才可进入主视图
  if (t.status === "active") return "board_visible";
  if (r >= 3) return "board_visible";
  if (r >= 2) return "board_visible";
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


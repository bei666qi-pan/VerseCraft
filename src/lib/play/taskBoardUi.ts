// src/lib/play/taskBoardUi.ts
// 阶段 5：任务板信息分层（纯函数，可测、无 React）

import { inferObjectiveKind } from "@/lib/domain/objectiveAdapters";
import { inferEffectiveNarrativeLayer, pathDemotionBias, promiseRiskHumanSignals } from "@/lib/tasks/taskRoleModel";
import { promiseRiskSortScore } from "@/lib/tasks/taskRevealModel";
import { getTaskVisibilityTier, isVisibleAsClue, isVisibleInPromiseLane, isVisibleOnBoard } from "@/lib/tasks/taskVisibilityPolicy";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import type { GameTask } from "@/store/useGameStore";

const GUIDANCE_RANK: Record<string, number> = {
  strong: 0,
  standard: 1,
  light: 2,
  none: 3,
};

function isClosedStatus(s: GameTask["status"]): boolean {
  return s === "completed" || s === "failed";
}

function isTrackable(s: GameTask["status"]): boolean {
  return s === "active" || s === "available";
}

function guidanceKey(t: GameTask): number {
  return GUIDANCE_RANK[t.guidanceLevel ?? "none"] ?? 3;
}

/** 当前「头等事」：主线优先，其次进行中，再其次可接。 */
export function pickPrimaryTask(tasks: GameTask[]): GameTask | null {
  const vis = (tasks ?? []).filter((t) => t && t.status !== "hidden");
  const open = vis.filter((t) => !isClosedStatus(t.status));
  const act = open.filter((t) => t.status === "active");
  const pool = act.length > 0 ? act : open.filter((t) => t.status === "available");
  if (pool.length === 0) return null;

  const scored = pool.map((t) => ({ t, kind: inferObjectiveKind(t as GameTaskV2) }));
  const main = scored.find((x) => x.kind === "main");
  if (main) return main.t;

  return [...pool].sort((a, b) => {
    const da = pathDemotionBias(a as GameTaskV2);
    const db = pathDemotionBias(b as GameTaskV2);
    if (da !== db) return da - db;
    const ga = guidanceKey(a);
    const gb = guidanceKey(b);
    if (ga !== gb) return ga - gb;
    const pa = a.type === "main" || a.type === "conspiracy" ? 0 : 1;
    const pb = b.type === "main" || b.type === "conspiracy" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title, "zh-Hans");
  })[0];
}

function isPromiseOrCommission(t: GameTask): boolean {
  const k = inferObjectiveKind(t as GameTaskV2);
  return k === "promise" || k === "commission";
}

function hasRiskSignal(t: GameTask): boolean {
  return Boolean(
    t.highRiskHighReward ||
      (typeof (t as { riskNote?: string }).riskNote === "string" &&
        String((t as { riskNote?: string }).riskNote).trim().length > 0) ||
      (t as { canBackfire?: boolean }).canBackfire ||
      t.dramaticType === "betrayal" ||
      t.dramaticType === "leverage"
  );
}

function isPromiseRiskSlot(t: GameTask): boolean {
  const v = t as GameTaskV2;
  if (isPromiseOrCommission(t) || hasRiskSignal(t)) return true;
  if (inferEffectiveNarrativeLayer(v) === "conversation_promise") return true;
  if (promiseRiskHumanSignals(v) >= 1.05) return true;
  return false;
}

/**
 * V3：统一可见策略后，任务板仅消费「应被玩家知晓的事」。
 * - formal_task：必须已在叙事中接下（可见）才进主任务区
 * - conversation_promise：进入承诺/风险带（不抢主视图）
 * - soft_lead：只当线索，不进主任务区
 */
export function filterTasksForTaskBoardVisibilityV2(tasks: GameTask[], enabled: boolean): GameTask[] {
  if (!enabled) return tasks ?? [];
  return (tasks ?? []).filter((t) => {
    if (!t || t.status === "hidden") return false;
    const tier = getTaskVisibilityTier(t as unknown as GameTaskV2);
    return tier !== "hidden";
  });
}

export type TaskBoardPartition = {
  primary: GameTask | null;
  /** 已接下的事（不含 primary，最多 4） */
  accepted: GameTask[];
  /** 承诺 / 风险（轻追踪，不抢主视图） */
  promises: GameTask[];
  /** 线索影子（不当作任务腔；默认极少） */
  clues: GameTask[];
  /** 其余可追踪（未列入上列） */
  overflow: GameTask[];
  completed: GameTask[];
  failed: GameTask[];
};

/**
 * 将可见任务分层；低价值「已完成/失败」单独归档，默认不占主视野。
 */
export function partitionTasksForBoard(tasks: GameTask[], maxPaths = 4): TaskBoardPartition {
  const vis = (tasks ?? []).filter((t) => t && t.status !== "hidden");
  const completed = vis.filter((t) => t.status === "completed");
  const failed = vis.filter((t) => t.status === "failed");
  const open = vis.filter((t) => isTrackable(t.status));

  // 主任务区只允许 board_visible（正式任务已接下）
  const boardOpen = open.filter((t) => isVisibleOnBoard(t as unknown as GameTaskV2));
  const primary = pickPrimaryTask(boardOpen);
  const primaryId = primary?.id ?? null;

  const restOpen = boardOpen.filter((t) => t.id !== primaryId);
  const accepted = [...restOpen]
    .sort((a, b) => {
      const da = pathDemotionBias(a as GameTaskV2);
      const db = pathDemotionBias(b as GameTaskV2);
      if (da !== db) return da - db;
      return guidanceKey(a) - guidanceKey(b) || a.title.localeCompare(b.title, "zh-Hans");
    })
    .slice(0, maxPaths);

  const acceptedIds = new Set(accepted.map((p) => p.id));

  // 承诺/风险：conversation_promise 且已被叙事提出（或 soft_tracked），并且不在主任务区
  const promiseCandidates = open.filter(
    (t) => t.id !== primaryId && !acceptedIds.has(t.id) && isVisibleInPromiseLane(t as unknown as GameTaskV2)
  );
  const promises = [...promiseCandidates]
    .sort((a, b) => promiseRiskSortScore(b as GameTaskV2) - promiseRiskSortScore(a as GameTaskV2) || a.title.localeCompare(b.title, "zh-Hans"))
    .slice(0, 6);

  // 线索影子：soft_lead（clue_only），默认只展示少量，避免任务板塞满
  const clueCandidates = open.filter((t) => isVisibleAsClue(t as unknown as GameTaskV2));
  const clues = [...clueCandidates].sort((a, b) => guidanceKey(a) - guidanceKey(b) || a.title.localeCompare(b.title, "zh-Hans")).slice(0, 3);

  const used = new Set<string>([
    ...(primaryId ? [primaryId] : []),
    ...accepted.map((p) => p.id),
    ...promises.map((p) => p.id),
    ...clues.map((p) => p.id),
  ]);
  const overflow = open.filter((t) => !used.has(t.id));

  return { primary, accepted, promises, clues, overflow, completed, failed };
}

export function goalKindLabel(t: GameTask): string {
  const k = inferObjectiveKind(t as GameTaskV2);
  if (k === "main") return "主线";
  if (k === "promise") return "约定";
  return "委托";
}

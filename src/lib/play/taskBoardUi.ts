// src/lib/play/taskBoardUi.ts
// 阶段 5：任务板信息分层（纯函数，可测、无 React）

import { inferObjectiveKind } from "@/lib/domain/objectiveAdapters";
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

export type TaskBoardPartition = {
  primary: GameTask | null;
  /** 可推进路径（不含 primary，最多 4） */
  paths: GameTask[];
  /** 承诺 / 委托 / 风险信号 */
  promiseRisk: GameTask[];
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

  const primary = pickPrimaryTask(tasks);
  const primaryId = primary?.id ?? null;

  const restOpen = open.filter((t) => t.id !== primaryId);
  const paths = [...restOpen]
    .sort((a, b) => guidanceKey(a) - guidanceKey(b) || a.title.localeCompare(b.title, "zh-Hans"))
    .slice(0, maxPaths);

  const pathIds = new Set(paths.map((p) => p.id));
  const promiseRiskCandidates = restOpen.filter(
    (t) => !pathIds.has(t.id) && (isPromiseOrCommission(t) || hasRiskSignal(t))
  );
  const promiseRisk = promiseRiskCandidates.slice(0, 6);

  const used = new Set<string>([...(primaryId ? [primaryId] : []), ...paths.map((p) => p.id), ...promiseRisk.map((p) => p.id)]);
  const overflow = restOpen.filter((t) => !used.has(t.id));

  return { primary, paths, promiseRisk, overflow, completed, failed };
}

export function goalKindLabel(t: GameTask): string {
  const k = inferObjectiveKind(t as GameTaskV2);
  if (k === "main") return "主线";
  if (k === "promise") return "承诺";
  return "委托";
}

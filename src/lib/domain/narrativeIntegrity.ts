// 阶段 6：目标/手记/物品交叉引用修复与一致性报告

import type { ClueEntry } from "./narrativeDomain";
import { mergeNarrativeTrace, normalizeNarrativeTrace } from "./narrativeDomain";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";

export type IntegrityIssueKind =
  | "task_pruned_required_item"
  | "clue_cleared_missing_objective"
  | "clue_cleared_stale_objective"
  | "clue_cleared_stale_mature_objective";

export interface NarrativeIntegrityReport {
  issues: Array<{ kind: IntegrityIssueKind; detail: string }>;
  repairsApplied: string[];
}

/**
 * 读档/云同步后调用：修剪不可能满足的 requiredItemIds、清理指向不存在或已死目标的线索关联。
 * 不删除任务本身；不自动完成目标。
 */
export function repairNarrativeCrossRefs(args: {
  tasks: GameTaskV2[];
  clues: ClueEntry[];
  inventoryItemIds: string[];
  warehouseItemIds: string[];
}): { tasks: GameTaskV2[]; clues: ClueEntry[]; report: NarrativeIntegrityReport } {
  const inv = new Set(args.inventoryItemIds.map((x) => String(x).trim()).filter(Boolean));
  const wh = new Set(args.warehouseItemIds.map((x) => String(x).trim()).filter(Boolean));
  const taskById = new Map(args.tasks.map((t) => [t.id, t]));
  const issues: NarrativeIntegrityReport["issues"] = [];
  const repairsApplied: string[] = [];

  const tasks = args.tasks.map((t) => {
    const req = t.requiredItemIds;
    if (!req?.length) return t;
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const id of req) {
      const k = String(id).trim();
      if (!k) continue;
      const reg = findRegisteredItemById(k);
      const held = inv.has(k) || wh.has(k);
      if (reg || held) {
        kept.push(k);
        continue;
      }
      dropped.push(k);
    }
    if (dropped.length === 0) return t;
    issues.push({ kind: "task_pruned_required_item", detail: `${t.id}:${dropped.join(",")}` });
    repairsApplied.push(`task:${t.id}:pruned_required:${dropped.join("+")}`);
    const repairTrace = normalizeNarrativeTrace({
      channel: "system_repair",
      audit: [`pruned_required:${dropped.slice(0, 6).join("+")}`],
    });
    const mergedTrace = mergeNarrativeTrace(t.narrativeTrace, repairTrace, true);
    return {
      ...t,
      ...(kept.length > 0 ? { requiredItemIds: kept } : { requiredItemIds: undefined }),
      ...(mergedTrace ? { narrativeTrace: mergedTrace } : {}),
    };
  });

  const taskMapAfter = new Map(tasks.map((t) => [t.id, t]));
  const clues = args.clues.map((c) => {
    const oid = c.relatedObjectiveId;
    if (!oid) return c;
    const task = taskMapAfter.get(oid);
    if (!task) {
      issues.push({ kind: "clue_cleared_missing_objective", detail: `${c.id}->${oid}` });
      repairsApplied.push(`clue:${c.id}:clear_missing_objective`);
      const repairTrace = normalizeNarrativeTrace({
        channel: "system_repair",
        audit: [`cleared_missing_objective:${oid}`],
      });
      const mergedTrace = mergeNarrativeTrace(c.trace, repairTrace, true);
      return { ...c, relatedObjectiveId: null, ...(mergedTrace ? { trace: mergedTrace } : {}) };
    }
    if (task.status === "failed" || task.status === "hidden") {
      issues.push({ kind: "clue_cleared_stale_objective", detail: `${c.id}->${oid}:${task.status}` });
      repairsApplied.push(`clue:${c.id}:clear_stale_objective:${task.status}`);
      const repairTrace = normalizeNarrativeTrace({
        channel: "system_repair",
        audit: [`cleared_stale_objective:${oid}:${task.status}`],
      });
      const mergedTrace = mergeNarrativeTrace(c.trace, repairTrace, true);
      return { ...c, relatedObjectiveId: null, ...(mergedTrace ? { trace: mergedTrace } : {}) };
    }
    return c;
  });

  const cluesMatured = clues.map((c) => {
    const mid = c.maturesToObjectiveId ? String(c.maturesToObjectiveId).trim() : "";
    if (!mid) return c;
    const task = taskMapAfter.get(mid);
    if (!task) return c;
    const terminal =
      task.status === "failed" || task.status === "hidden" || task.status === "completed";
    if (!terminal) return c;
    issues.push({
      kind: "clue_cleared_stale_mature_objective",
      detail: `${c.id}->${mid}:${task.status}`,
    });
    repairsApplied.push(`clue:${c.id}:clear_mature_objective:${task.status}`);
    const repairTrace = normalizeNarrativeTrace({
      channel: "system_repair",
      audit: [`cleared_mature_objective:${mid}:${task.status}`],
    });
    const mergedTrace = mergeNarrativeTrace(c.trace, repairTrace, true);
    const { maturesToObjectiveId: _drop, ...rest } = c;
    return { ...rest, ...(mergedTrace ? { trace: mergedTrace } : {}) };
  });

  return { tasks, clues: cluesMatured, report: { issues, repairsApplied } };
}

/** 只读校验（不修改），供测试或管理工具 */
export function checkNarrativeCrossRefs(args: {
  tasks: GameTaskV2[];
  clues: ClueEntry[];
  inventoryItemIds: string[];
  warehouseItemIds: string[];
}): NarrativeIntegrityReport {
  const { report } = repairNarrativeCrossRefs(args);
  return report;
}

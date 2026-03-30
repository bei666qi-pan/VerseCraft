import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import type { DomainObjectiveView, ObjectiveKind, ObjectiveProgress, TaskStatusSurface } from "./narrativeDomain";

/**
 * 从任务 id / type / goalKind 推断正式目标语义类（兼容旧档无 goalKind）。
 */
export function inferObjectiveKind(
  task: Pick<
    GameTaskV2,
    "id" | "type" | "goalKind" | "claimMode" | "reward" | "title" | "desc" | "taskNarrativeLayer"
  >
): ObjectiveKind {
  if (task.goalKind === "main" || task.goalKind === "promise" || task.goalKind === "commission") {
    return task.goalKind;
  }
  if (task.taskNarrativeLayer === "conversation_promise") return "promise";
  if (task.taskNarrativeLayer === "soft_lead") return "commission";
  if (task.id.startsWith("main_") || task.type === "main") return "main";
  if (task.claimMode === "npc_grant" && (task.reward?.originium ?? 0) > 0) return "commission";
  if (task.type === "character" && /承诺|答应|欠|人情/.test(`${task.title}${task.desc}`)) return "promise";
  if (task.type === "floor" || task.type === "conspiracy") return "commission";
  return "commission";
}

/** GameTaskV2 → 领域只读视图 */
export function taskToDomainObjective(task: GameTaskV2): DomainObjectiveView {
  const relatedNpcIds = [...new Set([task.issuerId, ...(task.relatedNpcIds ?? [])].filter(Boolean))];
  const relatedLocationIds = [...new Set(task.relatedLocationIds ?? [])];
  const relatedItemIds = [
    ...new Set([...(task.reward?.items ?? []), ...(task.reward?.warehouseItems ?? [])].filter(Boolean)),
  ];
  const narrativeSummary =
    task.urgencyReason?.trim() ||
    task.playerHook?.trim() ||
    task.nextHint?.trim() ||
    task.desc?.trim() ||
    "";
  return {
    id: task.id,
    kind: inferObjectiveKind(task),
    title: task.title,
    narrativeSummary,
    status: task.status as TaskStatusSurface,
    relatedNpcIds,
    relatedLocationIds,
    relatedItemIds,
    issuerId: task.issuerId,
    issuerName: task.issuerName,
  };
}

export function objectiveProgressFromTask(task: GameTaskV2, lastUpdatedAt: string | null): ObjectiveProgress {
  return {
    objectiveId: task.id,
    status: task.status as TaskStatusSurface,
    lastUpdatedAt,
  };
}

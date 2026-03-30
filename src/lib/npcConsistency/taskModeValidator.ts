/**
 * 阶段7：叙事任务层 — soft lead / promise 不得写成系统发单；formal 仍须像人话引出（启发式）。
 */

import type { TaskNarrativeLayerKind } from "@/lib/tasks/taskRoleModel";

export type TaskModeValidatorResult = {
  taskModeMismatchDetected: boolean;
  mismatchType: string | null;
  severity: "none" | "low" | "high";
  rewriteNeeded: boolean;
};

const SYSTEM_TASK_RE =
  /你已接取|任务已更新|系统(?:提示)?[：:]|新任务(?:已)?到账|任务面板|点击接受|悬赏(?:已)?发布|quest\s*log|objective\s*updated/i;

const PANEL_LINE_RE = /目标[：:][^。]{0,80}奖励[：:][^。]{0,80}进度[：:]/;
const NPC_LEAD_HINT_RE = /她|他|对方|人影|声音|目光|指尖|停顿|低声|抬眼|笑|叹/;

export function validateTaskModeNarrative(input: {
  narrative: string;
  /** 本回合 relevant task layers（已由 playerContext 解析） */
  taskLayers: Array<{ taskId: string; layer: TaskNarrativeLayerKind }>;
}): TaskModeValidatorResult {
  const n = String(input.narrative ?? "");
  if (!n.trim() || input.taskLayers.length === 0) {
    return {
      taskModeMismatchDetected: false,
      mismatchType: null,
      severity: "none",
      rewriteNeeded: false,
    };
  }

  const nonFormal = input.taskLayers.filter((x) => x.layer !== "formal_task");
  const hasFormalOnly = input.taskLayers.length > 0 && nonFormal.length === 0;

  if (nonFormal.length > 0) {
    if (SYSTEM_TASK_RE.test(n)) {
      return {
        taskModeMismatchDetected: true,
        mismatchType: "soft_or_promise_as_system_task",
        severity: "high",
        rewriteNeeded: true,
      };
    }
    if (PANEL_LINE_RE.test(n)) {
      return {
        taskModeMismatchDetected: true,
        mismatchType: "promise_as_panel_copy",
        severity: "low",
        rewriteNeeded: true,
      };
    }
  }

  if (hasFormalOnly) {
    const head = n.slice(0, Math.min(160, n.length));
    if (/^(?:任务|【任务】|委托任务)/.test(head.trim()) && !NPC_LEAD_HINT_RE.test(head.slice(0, 120))) {
      return {
        taskModeMismatchDetected: true,
        mismatchType: "formal_task_cold_open",
        severity: "low",
        rewriteNeeded: true,
      };
    }
  }

  return {
    taskModeMismatchDetected: false,
    mismatchType: null,
    severity: "none",
    rewriteNeeded: false,
  };
}

/**
 * 任务叙事授予实用函数。
 *
 * 2026-07 重构：移除 grantState，visibility 纯从 status 派生。
 */

import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { inferEffectiveNarrativeLayer } from "@/lib/tasks/taskRoleModel";

export function shouldAutoOpenTaskPanelForNewTask(t: GameTaskV2): boolean {
  const layer = inferEffectiveNarrativeLayer(t);
  if (layer !== "formal_task") return false;
  if (t.status !== "active") return false;
  return true;
}

export function applyNarrativeAcceptanceDefaults(t: GameTaskV2): GameTaskV2 {
  // After grantState removal: all formal_task are board-visible by status.
  // No default mutation needed — visibility is derived from status.
  return t;
}

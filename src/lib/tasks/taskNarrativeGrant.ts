import type { GameTaskV2, TaskGrantState } from "@/lib/tasks/taskV2";
import { inferEffectiveNarrativeLayer } from "@/lib/tasks/taskRoleModel";

export function advanceGrantStateForAcceptance(state: TaskGrantState | undefined): TaskGrantState {
  if (!state) return "accepted_in_story";
  if (state === "archived_hidden") return "archived_hidden";
  if (state === "visible_on_board") return "visible_on_board";
  if (state === "soft_tracked") return "soft_tracked";
  return "accepted_in_story";
}

export function shouldAutoOpenTaskPanelForNewTask(t: GameTaskV2): boolean {
  const layer = inferEffectiveNarrativeLayer(t);
  if (layer !== "formal_task") return false;
  if (t.status !== "active") return false;
  // active + formal_task 视为“叙事里已经接下并正在推进”
  return true;
}

export function applyNarrativeAcceptanceDefaults(t: GameTaskV2): GameTaskV2 {
  const layer = inferEffectiveNarrativeLayer(t);
  // 只有 formal_task 才会自动推进到 visible_on_board；承诺/线索不自动“上板”
  if (layer === "formal_task" && t.status === "active") {
    return { ...t, grantState: "visible_on_board" };
  }
  return t;
}


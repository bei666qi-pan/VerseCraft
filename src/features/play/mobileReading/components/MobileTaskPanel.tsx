"use client";

import { PlayNarrativeTaskBoard } from "@/features/play/components/PlayNarrativeTaskBoard";
import type { MobileTaskPanelProps } from "../types";

export function MobileTaskPanel({
  tasks,
  originium,
  codex,
  highlightTaskIds,
  onClaimTask,
}: MobileTaskPanelProps) {
  return (
    <section
      data-testid="mobile-task-panel"
      aria-label="任务"
      className="box-border flex h-full min-h-0 flex-col overflow-hidden bg-[#fbf8f2] px-4 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.75rem+env(safe-area-inset-bottom))] pt-[max(0.65rem,env(safe-area-inset-top))] text-[#164f4d] min-[420px]:px-5 min-[420px]:pt-[max(0.85rem,env(safe-area-inset-top))]"
    >
      <div className="vc-reading-serif shrink-0 px-1 text-[20px] font-semibold leading-none min-[420px]:text-[24px]">
        任务
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
        <PlayNarrativeTaskBoard
          tasks={tasks}
          originium={originium}
          codex={codex}
          highlightTaskIds={highlightTaskIds}
          onClaimTask={onClaimTask}
        />
      </div>
    </section>
  );
}

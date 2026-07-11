"use client";

import { PlayNarrativeTaskBoard } from "@/features/play/components/PlayNarrativeTaskBoard";
import type { MobileTaskPanelProps } from "../types";

export function MobileTaskPanel({
  tasks,
  originium,
  codex,
  highlightTaskIds,
  onClaimTask,
  taskPanelFirstOpen,
  onMarkTaskPanelOpened,
}: MobileTaskPanelProps) {
  return (
    <section
      data-testid="mobile-task-panel"
      aria-label="任务"
      className="box-border flex h-full min-h-0 flex-col overflow-hidden bg-[#fbf8f2] px-4 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.75rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] text-[#164f4d] min-[420px]:px-5 min-[420px]:pt-[max(0.95rem,env(safe-area-inset-top))]"
    >
      {/* 2026-07 四次修订：去掉重复的"任务"大标题——底部导航已用同名 tab 标注这个面板，
          图鉴/角色姊妹面板也都不在内容区顶部重复自己的 nav 标签，直接进入首个内容分区。
          PlayNarrativeTaskBoard 自带的"当前目标"图标标题承担原本的锚点作用。 */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2 pr-1">
        <PlayNarrativeTaskBoard
          tasks={tasks}
          originium={originium}
          codex={codex}
          highlightTaskIds={highlightTaskIds}
          onClaimTask={onClaimTask}
          taskPanelFirstOpen={taskPanelFirstOpen}
          onMarkTaskPanelOpened={onMarkTaskPanelOpened}
        />
      </div>
    </section>
  );
}

"use client";

import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import { PlayNarrativeTaskBoard } from "@/features/play/components/PlayNarrativeTaskBoard";

type PlayTaskPanelProps = {
  open: boolean;
  tasks: GameTask[];
  originium: number;
  onClose: () => void;
  onClaimTask: (taskId: string) => void;
  highlightTaskIds?: string[];
  journalClues?: ClueEntry[];
  codex?: Record<string, CodexEntry>;
};

export function PlayTaskPanel({
  open,
  tasks,
  originium,
  onClose,
  onClaimTask,
  highlightTaskIds,
  journalClues,
  codex,
}: PlayTaskPanelProps) {
  if (!open) return null;

  return (
    <aside className="pointer-events-auto fixed right-3 top-[84px] z-[72] w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white/95 shadow-[0_24px_56px_rgba(15,23,42,0.2)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wider text-slate-800">待办手记</h3>
          <p className="text-[11px] text-slate-500">正在推进 · 备选方向 · 约定与险情</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          收起
        </button>
      </div>

      <div className="max-h-[58vh] overflow-y-auto p-3">
        <PlayNarrativeTaskBoard
          tasks={tasks}
          originium={originium}
          journalClues={journalClues}
          codex={codex}
          highlightTaskIds={highlightTaskIds}
          onClaimTask={onClaimTask}
          density="overlay"
        />
      </div>
    </aside>
  );
}

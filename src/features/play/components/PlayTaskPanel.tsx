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
    <aside className="pointer-events-auto fixed right-3 top-[84px] z-[72] w-[352px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200/80 bg-white/85 shadow-[0_28px_72px_rgba(2,6,23,0.18)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wider text-slate-800">目标与局势</h3>
          <p className="text-[11px] text-slate-500">头等事 · 局势 · 在办 · 牵连 · 线索影子</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200/80 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          收起
        </button>
      </div>

      <div className="max-h-[56vh] overflow-y-auto p-3">
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

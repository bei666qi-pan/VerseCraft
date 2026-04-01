"use client";

import type { ConflictFeedbackViewModel } from "@/lib/play/conflictFeedbackPresentation";

/** 冲突回合余音：非战斗面板，不展示数值与系统术语。 */
export function PlayConflictTurnWhisper({ vm }: { vm: ConflictFeedbackViewModel }) {
  return (
    <aside
      className="animate-[fadeIn_0.6s_ease-out] rounded-2xl border border-slate-700/15 bg-gradient-to-b from-slate-900/[0.04] to-transparent px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-4"
      aria-label="冲突局势余音"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">局势余音</p>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">
        <span className="text-violet-950/90">{vm.situationLabel}</span>
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-normal text-slate-700">{vm.situationWhisper}</span>
      </p>
      <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-slate-600">
        <li>{vm.opportunityLine}</li>
        <li>{vm.costLine}</li>
        <li>
          <span className="font-medium text-slate-500">落点</span> — {vm.resultTierLabel}：{vm.resultTierWhisper}
        </li>
      </ul>
      {vm.narrativeEcho ? (
        <p className="mt-3 border-t border-slate-200/80 pt-2.5 text-[12px] italic leading-relaxed text-slate-500">
          「{vm.narrativeEcho}」
        </p>
      ) : null}
    </aside>
  );
}

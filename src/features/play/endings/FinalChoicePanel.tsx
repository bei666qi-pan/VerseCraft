"use client";

import type { EndingFinalChoice, EndingOutcome } from "@/lib/endings/types";
import { getEndingOutcomeTitle } from "@/lib/endings/summary";

export interface FinalChoicePanelProps {
  outcome: EndingOutcome;
  choices: EndingFinalChoice[];
  disabled?: boolean;
  onSelect: (choice: EndingFinalChoice) => void;
}

export function FinalChoicePanel({ outcome, choices, disabled = false, onSelect }: FinalChoicePanelProps) {
  return (
    <section
      data-testid="ending-final-choice-panel"
      aria-label="本局最终选择"
      className="mx-4 mb-[calc(var(--vc-mobile-bottom-nav-height)+1rem+env(safe-area-inset-bottom))] rounded-[8px] border border-[#9b6b48] bg-[#fffaf0] p-4 shadow-[0_12px_28px_rgba(75,45,24,0.18)]"
    >
      <div className="mb-3 border-b border-[#e5d5bd] pb-3">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[#9b4d2d]">本局终局</p>
        <h2 className="mt-1 vc-reading-serif text-[22px] font-semibold leading-tight text-[#3c2417]">
          最终选择已经到来
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#5f4a37]">
          这不是章节结束，也不是普通行动。你正在决定本局的最终叙事走向：{getEndingOutcomeTitle(outcome)}。
        </p>
      </div>
      <div className="grid gap-2">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            data-testid="ending-final-choice"
            disabled={disabled}
            onClick={() => onSelect(choice)}
            className="rounded-[8px] border border-[#d7bd9b] bg-[#fffdf8] px-4 py-3 text-left shadow-[0_3px_10px_rgba(75,45,24,0.08)] transition hover:border-[#9b6b48] hover:bg-[#fff6df] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="block vc-reading-serif text-[17px] font-semibold leading-snug text-[#3c2417]">
              {choice.label}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-[#6c5946]">{choice.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

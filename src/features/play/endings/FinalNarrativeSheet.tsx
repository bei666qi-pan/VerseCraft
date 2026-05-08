"use client";

import { ENDING_SETTLEMENT_OPTIONS } from "@/lib/endings/finalNarrativePrompt";
import type { EndingSettlementSnapshot } from "@/lib/endings/types";

export interface FinalNarrativeSheetProps {
  snapshot: EndingSettlementSnapshot;
  onViewSettlement: () => void;
  onExportWriting: () => void;
  onReviewFullText: () => void;
}

export function FinalNarrativeSheet({
  snapshot,
  onViewSettlement,
  onExportWriting,
  onReviewFullText,
}: FinalNarrativeSheetProps) {
  return (
    <section
      data-testid="ending-final-narrative-sheet"
      aria-label="最终叙事已完成"
      className="mx-4 mb-[calc(var(--vc-mobile-bottom-nav-height)+1rem+env(safe-area-inset-bottom))] rounded-[8px] border border-[#9b6b48] bg-[#fffaf0] p-4 shadow-[0_12px_28px_rgba(75,45,24,0.18)]"
    >
      <div className="border-b border-[#e5d5bd] pb-3">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[#9b4d2d]">本局终局已收束</p>
        <h2 className="mt-1 vc-reading-serif text-[22px] font-semibold leading-tight text-[#3c2417]">
          {snapshot.title}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#5f4a37]">{snapshot.caption}</p>
      </div>
      <div className="mt-3 grid gap-2">
        <button
          type="button"
          data-testid="ending-view-settlement"
          onClick={onViewSettlement}
          className="rounded-[8px] bg-[#3c2417] px-4 py-3 text-[15px] font-semibold text-[#fffdf8] shadow-[0_4px_12px_rgba(60,36,23,0.22)]"
        >
          {ENDING_SETTLEMENT_OPTIONS[0]}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="ending-export-writing"
            onClick={onExportWriting}
            className="rounded-[8px] border border-[#d7bd9b] bg-[#fffdf8] px-3 py-2 text-[13px] font-semibold text-[#4b3525]"
          >
            {ENDING_SETTLEMENT_OPTIONS[1]}
          </button>
          <button
            type="button"
            data-testid="ending-review-fulltext"
            onClick={onReviewFullText}
            className="rounded-[8px] border border-[#d7bd9b] bg-[#fffdf8] px-3 py-2 text-[13px] font-semibold text-[#4b3525]"
          >
            {ENDING_SETTLEMENT_OPTIONS[2]}
          </button>
        </div>
      </div>
    </section>
  );
}

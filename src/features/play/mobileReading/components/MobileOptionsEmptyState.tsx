"use client";

import { VcSpinner } from "@/features/play/components/VcSpinner";
import { mobileReadingTheme } from "../theme";
import type { MobileOptionsEmptyStateProps } from "../types";

export function MobileOptionsEmptyState({ busy, message }: MobileOptionsEmptyStateProps) {

  if (busy) {
    return (
      <div
        data-testid="mobile-options-dropdown"
        className="fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-stack-gap))] left-1/2 z-40 h-[var(--vc-mobile-options-panel-height)] w-[calc(100%-1.35rem)] max-w-[448px] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[#ded8ce] bg-vc-paper-bright p-3 text-[#174d46] shadow-[0_10px_26px_rgba(73,63,51,0.13),inset_0_1px_0_rgba(255,255,255,0.92)] min-[420px]:w-[calc(100%-2.7rem)] min-[420px]:p-4"
        aria-busy="true"
        role="status"
      >
        <div
          data-testid="mobile-options-loading-card"
          className="relative flex h-full items-center justify-center rounded-[14px] border border-[#ebe4d9] bg-vc-paper-bright px-3 py-3 min-[420px]:px-4"
        >
          <div className="pointer-events-none absolute inset-1.5 rounded-[12px] border border-[#efe8dd]" />
          <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rotate-45 border-l border-t border-[#e5d9c9]" aria-hidden />
          <div className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 rotate-45 border-b border-r border-[#e5d9c9]" aria-hidden />
          <div className="relative z-10 grid h-[4.35rem] w-[4.35rem] place-items-center rounded-full border border-[#d8d1c6]/75 bg-[#fbf7ef]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
            <div className="absolute inset-1.5 rounded-full border border-dashed border-[#aecac4]/70" aria-hidden />
            <VcSpinner size={42} strokeWidth={2.1} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mobile-options-empty-fallback" className={mobileReadingTheme.optionsEmptyState} role="status">
      {message?.trim() || "请直接写下下一步行动。"}
    </div>
  );
}

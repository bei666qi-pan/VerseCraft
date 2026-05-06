"use client";

import type { CSSProperties, ReactNode } from "react";
import { VcSpinner } from "@/features/play/components/VcSpinner";
import { mobileReadingTheme } from "../theme";
import type { MobileOptionsEmptyStateProps } from "../types";

const STAGE_PROGRESS: Record<NonNullable<MobileOptionsEmptyStateProps["stage"]>, number> = {
  idle: 8,
  request_sent: 18,
  context_building: 45,
  generating: 72,
  finalizing: 92,
  complete: 100,
};

const STAGE_INDEX: Record<NonNullable<MobileOptionsEmptyStateProps["stage"]>, number> = {
  idle: 0,
  request_sent: 0,
  context_building: 1,
  generating: 2,
  finalizing: 2,
  complete: 2,
};

const STAGE_LABELS = ["分析局势", "判断影响", "生成选项"] as const;

function StageLabels({ activeIndex }: { activeIndex: number }) {
  const nodes: ReactNode[] = [];
  STAGE_LABELS.forEach((label, index) => {
    nodes.push(
      <span key={label} className={index <= activeIndex ? "text-[#0f6a60]" : "text-[#9a948b]"}>
        {label}
      </span>
    );
    if (index < STAGE_LABELS.length - 1) {
      nodes.push(
        <span key={`dot-${label}`} className="text-[#0f6a60]">
          ·
        </span>
      );
    }
  });
  return <>{nodes}</>;
}

export function MobileOptionsEmptyState({ busy, message, progress, stage = "idle" }: MobileOptionsEmptyStateProps) {
  const safeProgress = Math.max(6, Math.min(100, progress ?? STAGE_PROGRESS[stage] ?? 8));
  const activeIndex = STAGE_INDEX[stage] ?? 0;

  if (busy) {
    return (
      <div
        data-testid="mobile-options-dropdown"
        className="fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-stack-gap))] left-1/2 z-40 h-[var(--vc-mobile-options-panel-height)] w-[calc(100%-1.35rem)] max-w-[448px] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[#ded8ce] bg-[#fffdf8] p-3 text-[#174d46] shadow-[0_10px_26px_rgba(73,63,51,0.13),inset_0_1px_0_rgba(255,255,255,0.92)] min-[420px]:w-[calc(100%-2.7rem)] min-[420px]:p-4"
        data-options-regen-stage={stage}
        role="status"
      >
        <div
          data-testid="mobile-options-loading-card"
          className="relative grid h-full grid-cols-[58px_minmax(0,1fr)] items-center gap-3 rounded-[14px] border border-[#ebe4d9] bg-[#fffdf8] px-3 py-3 min-[390px]:grid-cols-[68px_minmax(0,1fr)] min-[420px]:gap-4 min-[420px]:px-4"
        >
          <div className="pointer-events-none absolute inset-1.5 rounded-[12px] border border-[#efe8dd]" />
          <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rotate-45 border-l border-t border-[#e5d9c9]" aria-hidden />
          <div className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 rotate-45 border-b border-r border-[#e5d9c9]" aria-hidden />
          <div className="relative z-10 flex h-full items-center justify-center">
            <div className="relative grid h-[3.85rem] w-[3.85rem] place-items-center rounded-full border border-[#d8d1c6]/75 bg-[#fbf7ef]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] min-[390px]:h-[4.35rem] min-[390px]:w-[4.35rem]">
              <div className="absolute inset-1.5 rounded-full border border-dashed border-[#aecac4]/70" aria-hidden />
              <VcSpinner size={42} strokeWidth={2.1} />
            </div>
          </div>
          <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center px-1">
            <div
              data-testid="mobile-options-loading-title"
              className="vc-reading-serif w-full whitespace-nowrap text-center text-[clamp(1.28rem,5.1vw,2.05rem)] font-semibold leading-none text-[#0f6a60]"
            >
              正在整理可选行动
            </div>
            <div className="vc-reading-serif mt-5 grid w-full grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 text-center text-[clamp(0.78rem,3.05vw,1rem)] text-[#0f6a60] min-[390px]:mt-6 min-[390px]:gap-2.5">
              <StageLabels activeIndex={activeIndex} />
            </div>
            <div className="relative mt-4 h-px w-[92%] bg-[#d8d1c6] min-[390px]:mt-5">
              <div
                className="absolute left-0 top-0 h-px bg-[#2f746a] transition-[width] duration-500 ease-out"
                style={{ width: `${safeProgress}%` }}
              />
              {[16, 50, 84].map((left, index) => {
                const active = safeProgress >= left - 4;
                return (
                  <span
                    key={left}
                    className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500 ${
                      active
                        ? "bg-[#2f746a] shadow-[0_0_0_10px_rgba(47,116,106,0.1),0_0_22px_rgba(47,116,106,0.22)]"
                        : "bg-[#c8c0b4]"
                    }`}
                    style={{ left: `${left}%` } as CSSProperties}
                    data-active={index <= activeIndex}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="mobile-options-dropdown" className={mobileReadingTheme.optionsEmptyState} role="status">
      {message?.trim() || "当前暂无可用选项。"}
    </div>
  );
}

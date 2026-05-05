"use client";

import type { CSSProperties, ReactNode } from "react";
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

function LoadingStar() {
  return (
    <div className="relative flex h-[7.2rem] w-[7.2rem] shrink-0 items-center justify-center" aria-hidden>
      <div className="absolute inset-2 animate-spin rounded-full border border-[#d8d1c6]/65 border-b-transparent border-r-[#2f746a]/55 [animation-duration:2.4s]" />
      <div className="absolute inset-5 animate-spin rounded-full border border-dashed border-[#d8d1c6]/70 [animation-direction:reverse] [animation-duration:3.1s]" />
      <div
        className="h-[4.2rem] w-[4.2rem] animate-pulse bg-[#0f6a60] shadow-[0_0_24px_rgba(47,116,106,0.22)]"
        style={{
          clipPath:
            "polygon(50% 0%, 61% 38%, 100% 50%, 61% 62%, 50% 100%, 39% 62%, 0% 50%, 39% 38%)",
        }}
      />
      <div className="absolute left-2 top-4 h-1.5 w-1.5 rotate-45 bg-[#8fb1aa]" />
      <div className="absolute bottom-4 right-4 h-2 w-2 rotate-45 bg-[#c8d4cf]" />
    </div>
  );
}

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

export function MobileOptionsEmptyState({ busy, progress, stage = "idle" }: MobileOptionsEmptyStateProps) {
  const safeProgress = Math.max(6, Math.min(100, progress ?? STAGE_PROGRESS[stage] ?? 8));
  const activeIndex = STAGE_INDEX[stage] ?? 0;

  if (busy) {
    return (
      <div
        data-testid="mobile-options-dropdown"
        className="fixed bottom-[calc(var(--vc-mobile-bottom-nav-height)+var(--vc-mobile-stack-gap))] left-1/2 z-40 h-[var(--vc-mobile-options-panel-height)] w-[calc(100%-2rem)] max-w-[448px] -translate-x-1/2 overflow-hidden rounded-[18px] border border-[#ded8ce] bg-[#fffdf8] px-5 py-5 text-[#174d46] shadow-[0_10px_26px_rgba(73,63,51,0.13),inset_0_1px_0_rgba(255,255,255,0.92)] min-[420px]:w-[calc(100%-2.7rem)]"
        data-options-regen-stage={stage}
        role="status"
      >
        <div
          data-testid="mobile-options-loading-card"
          className="relative flex h-full items-center gap-5 rounded-[14px] border border-[#ebe4d9] bg-[#fffdf8]"
        >
          <div className="pointer-events-none absolute inset-2 rounded-[12px] border border-[#efe8dd]" />
          <div className="relative z-10 hidden pl-5 min-[390px]:block">
            <LoadingStar />
          </div>
          <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center px-4">
            <div className="vc-reading-serif text-center text-[clamp(1.75rem,7vw,2.5rem)] font-semibold leading-none text-[#0f6a60]">
              正在整理可选行动
            </div>
            <div className="vc-reading-serif mt-8 grid w-full grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-center text-[1.05rem] text-[#0f6a60]">
              <StageLabels activeIndex={activeIndex} />
            </div>
            <div className="relative mt-5 h-px w-[86%] bg-[#d8d1c6]">
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
      当前暂无可用选项。
    </div>
  );
}

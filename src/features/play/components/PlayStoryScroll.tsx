"use client";

import type { ReactNode, RefObject } from "react";
import type { CSSProperties } from "react";
import { DMNarrativeBlock, renderNarrativeText } from "../render/narrative";

export type PlayStoryDisplayEntry = { role: "assistant"; content: string };

export function PlayStoryScroll({
  scrollRef,
  onScrollContainer,
  displayEntries,
  isStreamVisualActive,
  smoothThinking,
  smoothNarrative,
  smoothComplete,
  inputMode,
  isLowSanity,
  isDarkMoon,
  liveNarrative,
  greenTips,
  firstTimeHint,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  onScrollContainer: () => void;
  displayEntries: PlayStoryDisplayEntry[];
  isStreamVisualActive: boolean;
  smoothThinking: boolean;
  smoothNarrative: string;
  smoothComplete: boolean;
  inputMode: string;
  isLowSanity: boolean;
  isDarkMoon: boolean;
  liveNarrative: string;
  greenTips: string[];
  firstTimeHint: string | null;
  children?: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={onScrollContainer}
      className="touch-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-6"
      style={{ overflowAnchor: "auto", WebkitOverflowScrolling: "touch" } as CSSProperties}
    >
      <div className="space-y-6">
        {displayEntries.length > 0 && (
          <div
            className={`animate-[fadeIn_0.8s_ease-out] ${isLowSanity ? "text-white" : isDarkMoon ? "text-slate-200" : "text-slate-800"}`}
          >
            {displayEntries.map((entry, idx) => {
              const safeContent = typeof entry.content === "string" ? entry.content : "";
              return safeContent.includes("获得了新物品，已放入书包") ? (
                <p
                  key={idx}
                  className="mb-6 text-base font-bold text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                >
                  {safeContent.replace(/\*\*/g, "")}
                </p>
              ) : (
                <div key={idx} className="mb-6">
                  <DMNarrativeBlock
                    content={safeContent}
                    isDarkMoon={isDarkMoon}
                    isLowSanity={isLowSanity}
                  />
                </div>
              );
            })}
          </div>
        )}

        {isStreamVisualActive ? (
          <div className="min-h-[100px] animate-[fadeIn_0.8s_ease-out] space-y-3">
            {smoothThinking ? (
              <div className="flex items-center gap-3 py-4">
                <div className="relative flex h-6 w-6 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
                  <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                </div>
                <span className="animate-pulse bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-sm font-medium tracking-widest text-transparent">
                  正在生成...
                </span>
              </div>
            ) : (
              <>
                <div
                  className={
                    isLowSanity
                      ? "space-y-6 text-[18px] leading-[1.8] text-white"
                      : isDarkMoon
                        ? "space-y-6 text-[18px] leading-[1.8] text-slate-200"
                        : "space-y-6 text-[18px] leading-[1.8] text-slate-800"
                  }
                >
                  <span className="whitespace-pre-wrap">
                    {renderNarrativeText(smoothNarrative, { plainOnly: true })}
                  </span>
                  {!smoothComplete && (
                    <span
                      className="ml-1 inline-block h-5 w-1.5 align-middle bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                      aria-hidden
                    />
                  )}
                </div>
                {smoothComplete && inputMode === "options" && (
                  <div className="flex items-center gap-3 pt-2 text-xs text-slate-400">
                    <div className="relative flex h-6 w-6 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
                      <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                    </div>
                    <span>生成选项中...</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : liveNarrative ? (
          <div className="animate-[fadeIn_0.8s_ease-out]">
            <DMNarrativeBlock
              content={liveNarrative}
              isDarkMoon={isDarkMoon}
              isLowSanity={isLowSanity}
            />
          </div>
        ) : displayEntries.length === 0 && !isStreamVisualActive ? (
          <div
            className={`h-24 ${isLowSanity ? "text-white/30" : isDarkMoon ? "text-red-300/30" : "text-slate-400"}`}
          />
        ) : null}

        {(greenTips.length > 0 || firstTimeHint) && (
          <div className="mt-2 space-y-1">
            {firstTimeHint && (
              <p
                className={`text-sm font-semibold ${
                  isLowSanity
                    ? "text-white/85"
                    : isDarkMoon
                      ? "text-slate-200"
                      : "text-slate-700"
                }`}
              >
                {firstTimeHint}
              </p>
            )}
            {greenTips.map((tip, idx) => (
              <p
                key={idx}
                className={`text-sm font-semibold ${
                  isLowSanity
                    ? "text-white/85"
                    : isDarkMoon
                      ? "text-slate-200"
                      : "text-slate-700"
                }`}
              >
                {tip}
              </p>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

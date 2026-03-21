"use client";

import { memo, type ReactNode, type RefObject } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { DMNarrativeBlock, renderNarrativeText } from "../render/narrative";

export type PlayStoryDisplayEntry = { role: "assistant" | "user"; content: string; logIndex: number };

function renderUserNarrative(content: string): string {
  const text = String(content ?? "").trim();
  if (!text) return "";
  if (/^我[\u4e00-\u9fa5a-zA-Z0-9，。！？!?,.;:：\s]+$/.test(text)) return text;
  if (/^[\u4e00-\u9fa5a-zA-Z0-9，。！？!?,.;:：\s]{1,40}$/.test(text)) return `你顺着思路推进：${text}。`;
  return `你调整了行动节奏，继续向前推进。`;
}

const StoryHistory = memo(function StoryHistory({
  displayEntries,
  isLowSanity,
  isDarkMoon,
  plainOnlyNewTurn,
  plainOnlyLogIndexMin,
}: {
  displayEntries: PlayStoryDisplayEntry[];
  isLowSanity: boolean;
  isDarkMoon: boolean;
  plainOnlyNewTurn: boolean;
  plainOnlyLogIndexMin: number;
}) {
  if (displayEntries.length === 0) return null;
  return (
    <div className={`${isLowSanity ? "text-white" : isDarkMoon ? "text-slate-200" : "text-slate-800"}`}>
      {displayEntries.map((entry) => {
        const safeContent = typeof entry.content === "string" ? entry.content : "";
        return safeContent.includes("获得了新物品，已放入书包") ? (
          <p
            key={entry.logIndex}
            className="mb-6 text-base font-bold text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]"
          >
            {safeContent.replace(/\*\*/g, "")}
          </p>
        ) : entry.role === "user" ? (
          <p
            key={entry.logIndex}
            className={`mb-5 text-[18px] leading-[1.8] ${
              isLowSanity ? "text-white/92" : isDarkMoon ? "text-slate-200" : "text-slate-800"
            }`}
          >
            {renderUserNarrative(safeContent)}
          </p>
        ) : (
          <div key={entry.logIndex} className="mb-6">
            <DMNarrativeBlock
              content={safeContent}
              isDarkMoon={isDarkMoon}
              isLowSanity={isLowSanity}
              plainOnly={plainOnlyNewTurn && entry.logIndex >= plainOnlyLogIndexMin}
            />
          </div>
        );
      })}
    </div>
  );
});

const StreamPanel = memo(function StreamPanel({
  isStreamVisualActive,
  smoothThinking,
  smoothNarrative,
  smoothComplete,
  isLowSanity,
  isDarkMoon,
}: {
  isStreamVisualActive: boolean;
  smoothThinking: boolean;
  smoothNarrative: string;
  smoothComplete: boolean;
  isLowSanity: boolean;
  isDarkMoon: boolean;
}) {
  if (!isStreamVisualActive) return null;
  return (
    <div className="min-h-[140px] space-y-3">
      {smoothThinking ? (
        <div className="flex items-center gap-3 py-3">
          <div className="relative flex h-6 w-6 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
            <div className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full">
              <Image
                src="/logo.svg"
                alt="文界工坊"
                width={18}
                height={18}
                className="object-cover scale-[1.08]"
              />
            </div>
          </div>
          <span className="bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-sm font-medium tracking-widest text-transparent">
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
          </div>
          {smoothComplete ? <div className="pt-2" /> : null}
        </>
      )}
    </div>
  );
});

export const PlayStoryScroll = memo(function PlayStoryScroll({
  scrollRef,
  onScrollContainer,
  displayEntries,
  isStreamVisualActive,
  suppressStreamVisual,
  smoothThinking,
  smoothNarrative,
  smoothComplete,
  isChatBusy,
  inputMode,
  isLowSanity,
  isDarkMoon,
  liveNarrative,
  greenTips,
  firstTimeHint,
  plainOnlyNewTurn,
  plainOnlyLogIndexMin,
  embeddedOpeningContent,
  openingAiBusy,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  onScrollContainer: () => void;
  displayEntries: PlayStoryDisplayEntry[];
  isStreamVisualActive: boolean;
  /** 开局仅拉 options 时隐藏流式条，避免空叙事占位与正文抢视觉 */
  suppressStreamVisual?: boolean;
  smoothThinking: boolean;
  smoothNarrative: string;
  smoothComplete: boolean;
  isChatBusy: boolean;
  inputMode: string;
  isLowSanity: boolean;
  isDarkMoon: boolean;
  liveNarrative: string;
  greenTips: string[];
  firstTimeHint: string | null;
  plainOnlyNewTurn: boolean;
  plainOnlyLogIndexMin: number;
  /** 尚无助手日志时由前端静态渲染的固定开场正文 */
  embeddedOpeningContent?: string | null;
  /** 正在向模型请求首回合 options */
  openingAiBusy?: boolean;
  children?: ReactNode;
}) {
  const streamOn = isStreamVisualActive && !suppressStreamVisual;

  return (
    <div
      ref={scrollRef}
      onScroll={onScrollContainer}
      className="touch-scroll min-h-0 flex-1 overflow-y-scroll overscroll-contain px-4 py-4 md:px-6 md:py-6"
      style={{ overflowAnchor: "auto", WebkitOverflowScrolling: "touch" } as CSSProperties}
    >
      <div className="space-y-6">
        {embeddedOpeningContent ? (
          <div className="animate-[fadeIn_0.8s_ease-out]">
            <DMNarrativeBlock
              content={embeddedOpeningContent}
              isDarkMoon={isDarkMoon}
              isLowSanity={isLowSanity}
            />
            {openingAiBusy ? (
              <div
                className={`mt-4 flex items-center gap-2 text-sm ${
                  isLowSanity ? "text-white/55" : isDarkMoon ? "text-slate-300/80" : "text-slate-500"
                }`}
              >
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400/90 shadow-[0_0_8px_rgba(99,102,241,0.7)]" />
                选项正在由主笔实时推演…
              </div>
            ) : null}
          </div>
        ) : null}

        <StoryHistory
          displayEntries={displayEntries}
          isDarkMoon={isDarkMoon}
          isLowSanity={isLowSanity}
          plainOnlyNewTurn={plainOnlyNewTurn}
          plainOnlyLogIndexMin={plainOnlyLogIndexMin}
        />

        <StreamPanel
          isStreamVisualActive={streamOn}
          smoothThinking={smoothThinking}
          smoothNarrative={smoothNarrative}
          smoothComplete={smoothComplete}
          isDarkMoon={isDarkMoon}
          isLowSanity={isLowSanity}
        />
        {inputMode === "options" && isChatBusy && smoothComplete && streamOn && (
          <div className="pt-2">
            <div className="relative flex h-6 w-6 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-[3px] border-slate-200/20" />
              <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-indigo-500 border-r-purple-500 animate-spin drop-shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              <div className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full">
                <Image
                  src="/logo.svg"
                  alt="文界工坊"
                  width={18}
                  height={18}
                  className="object-cover scale-[1.08]"
                />
              </div>
            </div>
          </div>
        )}

        {!isStreamVisualActive && liveNarrative ? (
          <div className="animate-[fadeIn_0.8s_ease-out]">
            <DMNarrativeBlock
              content={liveNarrative}
              isDarkMoon={isDarkMoon}
              isLowSanity={isLowSanity}
            />
          </div>
        ) : !embeddedOpeningContent && displayEntries.length === 0 && !isStreamVisualActive ? (
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
                    ? "text-emerald-200"
                    : isDarkMoon
                      ? "text-emerald-300"
                      : "text-emerald-600"
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
});

"use client";

import { memo, useMemo, type ReactNode, type RefObject } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { getClientConflictFeedbackV1Enabled } from "@/lib/rollout/versecraftClientRollout";
import { useGameStore } from "@/store/useGameStore";
import { selectTurnResultState } from "@/store/useGameStoreSelectors";
import { PlayConflictTurnWhisper } from "./PlayConflictTurnWhisper";
import { DMNarrativeBlock, renderNarrativeText } from "../render/narrative";
import {
  filterDisplayEntriesForUserQuoteDedup,
  formatUserNarrativeForDisplay,
} from "../render/userNarrative";
import { PlaySemanticWaitingHint, type PlaySemanticWaitingKind } from "./PlaySemanticWaitingHint";
import { VcSpinner } from "./VcSpinner";

export type PlayStoryDisplayEntry = { role: "assistant" | "user"; content: string; logIndex: number };

function renderUserNarrative(content: string): string {
  return formatUserNarrativeForDisplay(content);
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
  const visibleEntries = useMemo(
    () => filterDisplayEntriesForUserQuoteDedup(displayEntries),
    [displayEntries]
  );
  if (visibleEntries.length === 0) return null;
  return (
    <div className="text-[#e7bb8f]">
      {visibleEntries.map((entry) => {
        const safeContent = typeof entry.content === "string" ? entry.content : "";
        return safeContent.includes("获得了新物品，已放入书包") ? (
          <p
            key={entry.logIndex}
            className="mb-8 text-base font-bold text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.45)]"
          >
            {safeContent.replace(/\*\*/g, "")}
          </p>
        ) : entry.role === "user" ? (
          <p
            key={entry.logIndex}
            className="mb-8 vc-reading-serif text-[21px] leading-[2.05] text-[#e7bb8f]"
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
  semanticWaitingKind,
  waitUxPrimaryLine,
  waitUxSecondaryLine,
  streamStalledHintOn,
}: {
  isStreamVisualActive: boolean;
  smoothThinking: boolean;
  smoothNarrative: string;
  smoothComplete: boolean;
  semanticWaitingKind: PlaySemanticWaitingKind | null;
  /** 等待期主文案（空则回退默认短句） */
  waitUxPrimaryLine?: string;
  /** 等待期副文案（更轻、可选） */
  waitUxSecondaryLine?: string | null;
  streamStalledHintOn?: boolean;
}) {
  if (!isStreamVisualActive) return null;
  const primaryThinkingLine =
    waitUxPrimaryLine && waitUxPrimaryLine.trim().length > 0
      ? waitUxPrimaryLine.trim()
      : "正在继续处理你的行动";
  const useLegacySemanticHint =
    !waitUxSecondaryLine &&
    (!waitUxPrimaryLine || waitUxPrimaryLine.trim().length === 0) &&
    semanticWaitingKind &&
    semanticWaitingKind !== "unknown";

  return (
    <div className="min-h-[140px] space-y-3">
      {smoothThinking ? (
        <div className="space-y-1 py-2 transition-opacity duration-300 ease-out">
          <div className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400/90 vc-wait-breath" />
            <span className="text-sm font-medium text-[#d6a07b]">{primaryThinkingLine}</span>
          </div>
          {waitUxSecondaryLine && waitUxSecondaryLine.trim().length > 0 ? (
            <div className="text-[11px] text-[#9d826e]">{waitUxSecondaryLine.trim()}</div>
          ) : useLegacySemanticHint ? (
            <PlaySemanticWaitingHint kind={semanticWaitingKind} />
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-6 vc-reading-serif text-[21px] leading-[2.05] text-[#e7bb8f]">
            <span className="whitespace-pre-wrap">
              {renderNarrativeText(smoothNarrative, { streamSafe: true })}
            </span>
          </div>
          {streamStalledHintOn ? (
            <div className="flex items-center gap-2 text-[12px] text-[#9d826e]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400/80 vc-wait-breath" />
              内容仍在继续形成
            </div>
          ) : null}
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
  semanticWaitingKind,
  waitUxPrimaryLine,
  waitUxSecondaryLine,
  streamStalledHintOn,
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
  /** 嵌入区「主笔推演」提示：请传入已与 `streamPhase` 交叉校验后的值（如父组件中的 openingBusyUi） */
  openingAiBusy?: boolean;
  /** waiting_upstream 阶段的语义化过渡提示（不伪造剧情，仅减轻心理空白）。 */
  semanticWaitingKind?: PlaySemanticWaitingKind | null;
  waitUxPrimaryLine?: string;
  waitUxSecondaryLine?: string | null;
  streamStalledHintOn?: boolean;
  children?: ReactNode;
}) {
  const streamOn = isStreamVisualActive && !suppressStreamVisual;
  const conflictFeedback = useGameStore((s) => selectTurnResultState(s).conflictTurnFeedback);
  const showConflictWhisper = getClientConflictFeedbackV1Enabled() && Boolean(conflictFeedback) && !streamOn;

  return (
    <div
      ref={scrollRef}
      onScroll={onScrollContainer}
      className="touch-scroll min-h-0 flex-1 overflow-y-scroll overscroll-contain px-6 pb-4 pt-6 md:px-8 md:py-7"
      style={{ overflowAnchor: "auto", WebkitOverflowScrolling: "touch" } as CSSProperties}
    >
      <div className="space-y-7">
        {embeddedOpeningContent ? (
          <div className="animate-[fadeIn_0.8s_ease-out]">
            <DMNarrativeBlock
              content={embeddedOpeningContent}
              isDarkMoon={isDarkMoon}
              isLowSanity={isLowSanity}
            />
            {openingAiBusy ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-[#9d826e]">
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
          semanticWaitingKind={semanticWaitingKind ?? null}
          waitUxPrimaryLine={waitUxPrimaryLine}
          waitUxSecondaryLine={waitUxSecondaryLine}
          streamStalledHintOn={streamStalledHintOn}
        />
        {inputMode === "options" && isChatBusy && smoothComplete && streamOn && (
          <div className="pt-2">
            <div className="vc-wait-breath relative h-6 w-6">
              <VcSpinner size={24} strokeWidth={3} tone="blackblue" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[14px] w-[14px] overflow-hidden rounded-full">
                  <Image
                    src="/logo.svg"
                    alt="文界工坊"
                    width={14}
                    height={14}
                    className="object-cover scale-[1.06]"
                    priority={false}
                  />
                </div>
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
          <div className="h-24 text-[#9d826e]" />
        ) : null}

        {showConflictWhisper && conflictFeedback ? <PlayConflictTurnWhisper vm={conflictFeedback} /> : null}

        {(greenTips.length > 0 || firstTimeHint) && (
          <div className="mt-2 space-y-1">
            {firstTimeHint && (
              <p className="text-sm font-semibold text-emerald-300">
                {firstTimeHint}
              </p>
            )}
            {greenTips.map((tip, idx) => (
              <p key={idx} className="text-sm font-semibold text-[#d6a07b]">
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

"use client";

import { memo, useMemo, type ReactNode, type RefObject } from "react";
import type { CSSProperties } from "react";
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

export type ChatQueuePanelState = {
  active: boolean;
  status: "idle" | "queued" | "ready" | "running" | "failed" | "expired" | "cancelled" | "rejected";
  position: number | null;
  etaSeconds: number | null;
  retryAfterSeconds: number | null;
  message: string;
  wasQueued?: boolean;
};

const STORY_TYPOGRAPHY_CLASS =
  "vc-reading-serif text-[var(--vc-story-font-size)] leading-[var(--vc-story-line-height)] tracking-normal text-[#174d46]";
const STORY_TYPOGRAPHY_STYLE = {
  fontSize: "var(--vc-story-font-size, 22px)",
  lineHeight: "var(--vc-story-line-height, 46.64px)",
} satisfies CSSProperties;

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
    <div className="text-[#174d46]">
      {visibleEntries.map((entry) => {
        const safeContent = typeof entry.content === "string" ? entry.content : "";
        return safeContent.includes("获得了新物品，已放入书包") ? (
          <p
            key={entry.logIndex}
            className="mb-8 text-base font-bold text-[#2f746a]"
          >
            {safeContent.replace(/\*\*/g, "")}
          </p>
        ) : entry.role === "user" ? (
          <p
            key={entry.logIndex}
            className={`mb-10 ${STORY_TYPOGRAPHY_CLASS}`}
            style={STORY_TYPOGRAPHY_STYLE}
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
            <VcSpinner size={28} strokeWidth={2} className="shrink-0" />
            <span
              data-testid="stream-waiting-primary-line"
              className={`${STORY_TYPOGRAPHY_CLASS} font-medium text-[#4f706a]`}
              style={STORY_TYPOGRAPHY_STYLE}
            >
              {primaryThinkingLine}
            </span>
          </div>
          {waitUxSecondaryLine && waitUxSecondaryLine.trim().length > 0 ? (
            <div className="text-[11px] text-[#8b8a84]">{waitUxSecondaryLine.trim()}</div>
          ) : useLegacySemanticHint ? (
            <PlaySemanticWaitingHint kind={semanticWaitingKind} />
          ) : null}
        </div>
      ) : (
        <>
          <div
            data-testid="stream-narrative-block"
            className={`space-y-6 ${STORY_TYPOGRAPHY_CLASS}`}
            style={STORY_TYPOGRAPHY_STYLE}
          >
            <span className="whitespace-pre-wrap">
              {renderNarrativeText(smoothNarrative, { streamSafe: true })}
            </span>
          </div>
          {streamStalledHintOn ? (
            <div className="flex items-center gap-2 text-[12px] text-[#8b8a84]">
              <VcSpinner size={20} strokeWidth={1.5} tone="neutral" className="shrink-0" />
              内容仍在继续形成
            </div>
          ) : null}
          {smoothComplete ? <div className="pt-2" /> : null}
        </>
      )}
    </div>
  );
});

const ChatQueuePanel = memo(function ChatQueuePanel({
  state,
  onCancel,
}: {
  state: ChatQueuePanelState;
  onCancel?: () => void;
}) {
  if (!state.active || state.status === "idle" || state.status === "cancelled") return null;
  const positionText =
    typeof state.position === "number" && Number.isFinite(state.position)
      ? `你前面还有 ${Math.max(0, state.position)} 人`
      : "正在确认你的位置";
  const etaText =
    typeof state.etaSeconds === "number" && Number.isFinite(state.etaSeconds)
      ? `预计等待约 ${Math.max(1, Math.ceil(state.etaSeconds))} 秒`
      : "预计等待时间正在计算";
  const running = state.status === "ready" || state.status === "running";
  const terminal = state.status === "failed" || state.status === "expired" || state.status === "rejected";
  if (running && !state.wasQueued) return null;

  return (
    <div
      data-testid="chat-queue-status"
      className="rounded-[8px] border border-[#d7d1bd] bg-[#fffdf8]/90 px-4 py-3 text-[#174d46] shadow-[0_8px_24px_rgba(42,55,45,0.08)]"
    >
      <div className="flex items-start gap-3">
        {!terminal ? <VcSpinner size={24} strokeWidth={1.8} className="mt-0.5 shrink-0" /> : null}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">{state.message}</p>
          {!running && !terminal ? (
            <>
              <p className="text-xs text-[#5f756f]">{positionText}</p>
              <p className="text-xs text-[#7e7b70]">{etaText}</p>
              <p className="text-xs text-[#8b8a84]">不用重复提交，轮到后会自动继续。</p>
            </>
          ) : null}
          {terminal && state.retryAfterSeconds ? (
            <p className="text-xs text-[#7e7b70]">可稍等约 {Math.max(1, Math.ceil(state.retryAfterSeconds))} 秒后再试。</p>
          ) : null}
        </div>
        {!terminal && onCancel ? (
          <button
            type="button"
            data-testid="chat-queue-cancel"
            onClick={onCancel}
            className="shrink-0 rounded-[6px] border border-[#d7d1bd] px-2 py-1 text-xs text-[#5f756f]"
          >
            取消排队
          </button>
        ) : null}
      </div>
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
  plainOnlyNewTurn,
  plainOnlyLogIndexMin,
  embeddedOpeningContent,
  openingAiBusy,
  semanticWaitingKind,
  waitUxPrimaryLine,
  waitUxSecondaryLine,
  chatQueueState,
  onCancelChatQueue,
  streamStalledHintOn,
  fixedBottomSpace = "default",
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
  chatQueueState?: ChatQueuePanelState | null;
  onCancelChatQueue?: () => void;
  streamStalledHintOn?: boolean;
  fixedBottomSpace?: "default" | "expanded";
  children?: ReactNode;
}) {
  const streamOn = isStreamVisualActive && !suppressStreamVisual;
  const conflictFeedback = useGameStore((s) => selectTurnResultState(s).conflictTurnFeedback);
  const showConflictWhisper = getClientConflictFeedbackV1Enabled() && Boolean(conflictFeedback) && !streamOn;
  const bottomSpaceVar =
    fixedBottomSpace === "expanded"
      ? "--vc-mobile-fixed-bottom-space-expanded"
      : "--vc-mobile-fixed-bottom-space";

  return (
    <div
      ref={scrollRef}
      onScroll={onScrollContainer}
      data-testid="play-story-document"
      className="px-[1.75rem] pt-7 md:px-8 md:pt-7"
      style={
        {
          overflowAnchor: "auto",
          paddingBottom: `calc(var(${bottomSpaceVar}) + env(safe-area-inset-bottom))`,
        } as CSSProperties
      }
    >
      <div className="space-y-10">
        {embeddedOpeningContent ? (
          <div className="animate-[fadeIn_0.8s_ease-out]">
            <DMNarrativeBlock
              content={embeddedOpeningContent}
              isDarkMoon={isDarkMoon}
              isLowSanity={isLowSanity}
            />
            {openingAiBusy ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-[#4f706a]">
                <VcSpinner size={24} strokeWidth={1.6} className="shrink-0" />
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

        {chatQueueState?.active ? (
          <ChatQueuePanel state={chatQueueState} onCancel={onCancelChatQueue} />
        ) : null}

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
            <VcSpinner size={32} strokeWidth={2.4} tone="blackblue" />
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
          <div className="h-24 text-[#8b8a84]" />
        ) : null}

        {showConflictWhisper && conflictFeedback ? <PlayConflictTurnWhisper vm={conflictFeedback} /> : null}

        {children}
      </div>
    </div>
  );
});

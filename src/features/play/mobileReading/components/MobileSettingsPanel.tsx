"use client";

import { useMemo, useState } from "react";
import type { ChapterId } from "@/lib/chapters";
import { MobileReadingIcons } from "../icons";
import {
  READING_PREFERENCE_GROUPS,
  type ReadingPreferences,
} from "../readingPreferences";
import type { MobileSettingsPanelProps } from "../types";
import { ChapterSwitchModal } from "./ChapterSwitchModal";
import { GameGuideModal } from "./GameGuideModal";

function SettingsDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[#a85d36] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#8f5435]/78" />
      <span className="text-[17px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#8f5435]/78" />
    </div>
  );
}

function PreferenceSegment({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 min-w-0 flex-1 rounded-full border vc-reading-serif text-[18px] leading-none transition active:scale-[0.98] min-[420px]:h-11 min-[420px]:text-[20px] ${
        active
          ? "border-[#f1c17b]/92 bg-[#714927]/86 text-[#f4c17b] shadow-[inset_0_0_16px_rgba(255,200,130,0.16),0_0_14px_rgba(234,160,88,0.2)]"
          : "border-[#b76639]/78 bg-[#07131d]/42 text-[#d59d63] hover:bg-[#10202a]/80"
      }`}
    >
      {children}
    </button>
  );
}

export function MobileSettingsPanel({
  accountName,
  audioMuted,
  chapterState,
  onExitGame,
  onReturnToActiveChapter,
  onReviewChapter,
  onSetReadingPreference,
  onToggleMute,
  readingPreferences,
  setVolume,
  volume,
}: MobileSettingsPanelProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [chapterOpen, setChapterOpen] = useState(false);
  const AudioIcon = audioMuted ? MobileReadingIcons.AudioOff : MobileReadingIcons.AudioOn;
  const safeVolume = Math.max(0, Math.min(100, Math.round(volume)));
  const sliderBackground = useMemo(
    () =>
      `linear-gradient(90deg, #d99a55 0%, #c78b4e ${safeVolume}%, rgba(42,55,62,0.78) ${safeVolume}%, rgba(42,55,62,0.78) 100%)`,
    [safeVolume]
  );

  return (
    <section
      data-testid="mobile-settings-panel"
      aria-label="设置"
      className="box-border flex h-full min-h-0 flex-col overflow-hidden px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.95rem+env(safe-area-inset-bottom))] pt-[max(1.15rem,env(safe-area-inset-top))] text-[#d99a55] min-[420px]:px-6 min-[420px]:pt-[max(1.45rem,env(safe-area-inset-top))]"
    >
      <header className="flex h-[4.15rem] shrink-0 items-center gap-2 border-b border-[#9a5a36]/68 min-[420px]:h-[4.75rem]">
        <span className="vc-reading-serif text-[31px] leading-none text-[#e7a15a] drop-shadow-[0_0_10px_rgba(231,161,90,0.25)] min-[420px]:text-[36px]">
          VerseCraft
        </span>
        <MobileReadingIcons.BrandMark className="mt-1 h-7 w-7 text-[#d99554] min-[420px]:h-8 min-[420px]:w-8" strokeWidth={1.45} />
      </header>

      <div className="flex h-[4.55rem] shrink-0 items-center justify-between gap-4 min-[420px]:h-[5.1rem]">
        <h1 className="vc-reading-serif text-[40px] font-semibold leading-none text-[#d7a05d] min-[420px]:text-[45px]">设置</h1>
        <div
          data-testid="settings-account-pill"
          className="min-w-0 rounded-full border border-[#bb6d3e]/86 bg-[#07131d]/58 px-4 py-3 vc-reading-serif text-[18px] leading-none text-[#d69a60] shadow-[inset_0_0_16px_rgba(217,151,86,0.05)] min-[420px]:px-6 min-[420px]:text-[21px]"
          title={`当前账号 ${accountName}`}
        >
          <span className="block max-w-[10rem] truncate whitespace-nowrap min-[420px]:max-w-[12rem]">
            当前账号&nbsp; {accountName}
          </span>
        </div>
      </div>

      <SettingsDivider className="shrink-0" />

      <div className="grid h-[4.35rem] shrink-0 grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 border-b border-[#8f5435]/72 px-6 min-[420px]:h-[4.85rem] min-[420px]:grid-cols-[minmax(0,1fr)_8rem] min-[420px]:px-8">
        <span className="vc-reading-serif text-[25px] font-semibold leading-none text-[#dca160] min-[420px]:text-[29px]">游戏指南</span>
        <button
          type="button"
          data-testid="open-game-guide-button"
          aria-label="查看游戏指南"
          onClick={() => setGuideOpen(true)}
          className="h-12 rounded-full border border-[#c97943]/86 bg-[#07131d]/55 vc-reading-serif text-[21px] leading-none text-[#dca160] transition hover:bg-[#10202a]/80 active:scale-95 min-[420px]:h-[3.45rem] min-[420px]:text-[24px]"
        >
          查看
        </button>
      </div>

      <div className="grid h-[4.9rem] shrink-0 grid-cols-[4.5rem_minmax(0,1fr)_3.1rem_3.15rem] items-center gap-3 border-b border-[#8f5435]/72 px-6 min-[420px]:h-[5.55rem] min-[420px]:grid-cols-[5.2rem_minmax(0,1fr)_3.5rem_3.65rem] min-[420px]:px-8">
        <span className="vc-reading-serif text-[25px] font-semibold leading-none text-[#dca160] min-[420px]:text-[29px]">声音</span>
        <input
          type="range"
          min={0}
          max={100}
          value={safeVolume}
          onChange={(event) => setVolume(Number(event.target.value))}
          aria-label="声音音量"
          data-testid="settings-volume-slider"
          className="h-7 w-full min-w-0 appearance-none rounded-full bg-transparent [--thumb-size:1.55rem] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-0.53rem] [&::-webkit-slider-thumb]:h-[var(--thumb-size)] [&::-webkit-slider-thumb]:w-[var(--thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#edbd80] [&::-webkit-slider-thumb]:bg-[#c58a4d] [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(240,180,100,0.45)] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:h-[var(--thumb-size)] [&::-moz-range-thumb]:w-[var(--thumb-size)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#edbd80] [&::-moz-range-thumb]:bg-[#c58a4d] min-[420px]:[--thumb-size:1.7rem]"
          style={{ background: sliderBackground }}
        />
        <span data-testid="settings-volume-percent" className="vc-reading-serif text-right text-[22px] leading-none text-[#dca160] min-[420px]:text-[24px]">
          {safeVolume}%
        </span>
        <button
          type="button"
          data-testid="settings-mute-button"
          aria-label={audioMuted ? "取消静音" : "静音"}
          onClick={onToggleMute}
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[#bd6f3e]/90 bg-[#07131d]/65 text-[#d99a55] shadow-[0_0_14px_rgba(217,151,86,0.14),inset_0_0_12px_rgba(217,151,86,0.07)] transition hover:bg-[#10202a] active:scale-95 min-[420px]:h-[3.65rem] min-[420px]:w-[3.65rem]"
        >
          <AudioIcon className="h-7 w-7 min-[420px]:h-8 min-[420px]:w-8" strokeWidth={1.7} />
        </button>
      </div>

      <div className="flex h-[5rem] shrink-0 flex-col justify-center min-[420px]:h-[5.85rem]">
        <SettingsDivider />
        <h2 className="my-3 text-center vc-reading-serif text-[29px] font-semibold leading-none text-[#dca160] min-[420px]:my-4 min-[420px]:text-[34px]">
          阅读体验
        </h2>
        <SettingsDivider className="mx-auto w-[94%]" />
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-4 gap-3 px-3 min-[420px]:gap-4">
        {READING_PREFERENCE_GROUPS.map((group) => (
          <div
            key={group.key}
            data-testid={`reading-preference-${group.key}`}
            className="grid min-h-0 grid-cols-[5.3rem_minmax(0,1fr)] items-center gap-3 rounded-[10px] border border-[#b76639]/84 bg-[#07131d]/30 px-3 min-[420px]:grid-cols-[6.3rem_minmax(0,1fr)] min-[420px]:px-4"
          >
            <div className="vc-reading-serif text-center text-[21px] font-semibold leading-none text-[#dca160] min-[420px]:text-[24px]">
              {group.label}
            </div>
            <div className="flex gap-2 min-[420px]:gap-3">
              {group.options.map((option) => (
                <PreferenceSegment
                  key={option.value}
                  active={readingPreferences[group.key] === option.value}
                  onClick={() =>
                    onSetReadingPreference(
                      group.key,
                      option.value as ReadingPreferences[typeof group.key]
                    )
                  }
                >
                  {option.label}
                </PreferenceSegment>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SettingsDivider className="my-4 shrink-0 min-[420px]:my-5" />

      <div className="grid h-[4.45rem] shrink-0 grid-cols-2 gap-3 px-3 min-[420px]:h-[5rem] min-[420px]:gap-4">
        <button
          type="button"
          data-testid="open-chapter-switch-button"
          onClick={() => setChapterOpen(true)}
          className="rounded-[14px] border border-[#d09255]/92 bg-[#3b2819]/82 vc-reading-serif text-[22px] leading-none text-[#dca160] shadow-[inset_0_0_18px_rgba(237,176,104,0.08),0_0_16px_rgba(210,146,85,0.08)] transition hover:bg-[#49301d] active:scale-[0.98] min-[420px]:text-[25px]"
        >
          切换章节
        </button>
        <button
          type="button"
          data-testid="settings-exit-game-button"
          onClick={onExitGame}
          className="rounded-[14px] border border-[#c55342]/86 bg-[#3a0d0d]/80 vc-reading-serif text-[22px] leading-none text-[#cfa35c] shadow-[inset_0_0_18px_rgba(197,83,66,0.1),0_0_16px_rgba(197,83,66,0.08)] transition hover:bg-[#4a1111] active:scale-[0.98] min-[420px]:text-[25px]"
        >
          退出游戏
        </button>
      </div>

      <GameGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <ChapterSwitchModal
        chapterState={chapterState}
        open={chapterOpen}
        onClose={() => setChapterOpen(false)}
        onSelectChapter={(chapterId: ChapterId) => {
          if (chapterId === chapterState.activeChapterId) {
            onReturnToActiveChapter();
          } else {
            onReviewChapter(chapterId);
          }
          setChapterOpen(false);
        }}
      />
    </section>
  );
}

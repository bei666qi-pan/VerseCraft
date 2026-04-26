"use client";

import { useMemo, useState } from "react";
import type { ChapterId, ChapterState } from "@/lib/chapters";
import { MobileReadingIcons } from "../icons";
import {
  READING_PREFERENCE_GROUPS,
  type ReadingPreferenceKey,
  type ReadingPreferences,
} from "../readingPreferences";
import { ChapterSwitchModal } from "./ChapterSwitchModal";
import { GameGuideModal } from "./GameGuideModal";

function SettingsDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[#a85d36] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#8f5435]/70" />
      <span className="text-[18px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#8f5435]/70" />
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
      className={`h-11 min-w-0 flex-1 rounded-full border vc-reading-serif text-[20px] leading-none transition active:scale-[0.98] ${
        active
          ? "border-[#f1c17b]/90 bg-[#7a512d]/82 text-[#f4c17b] shadow-[inset_0_0_14px_rgba(255,200,130,0.14),0_0_12px_rgba(234,160,88,0.18)]"
          : "border-[#b76639]/75 bg-[#07131d]/45 text-[#d59d63] hover:bg-[#10202a]/80"
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
}: {
  accountName: string;
  audioMuted: boolean;
  chapterState: ChapterState;
  onExitGame: () => void;
  onReturnToActiveChapter: () => void;
  onReviewChapter: (chapterId: ChapterId) => void;
  onSetReadingPreference: (key: ReadingPreferenceKey, value: ReadingPreferences[ReadingPreferenceKey]) => void;
  onToggleMute: () => void;
  readingPreferences: ReadingPreferences;
  setVolume: (value: number) => void;
  volume: number;
}) {
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
      className="min-h-[100svh] px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+2.4rem+env(safe-area-inset-bottom))] pt-[max(2.1rem,env(safe-area-inset-top))] text-[#d99a55]"
    >
      <div className="flex items-center gap-2 border-b border-[#9a5a36]/65 pb-6">
        <span className="vc-reading-serif text-[31px] leading-none text-[#e7a15a] drop-shadow-[0_0_10px_rgba(231,161,90,0.25)]">
          VerseCraft
        </span>
        <MobileReadingIcons.BrandMark className="mt-1 h-7 w-7 text-[#d99554]" strokeWidth={1.45} />
      </div>

      <div className="mt-9 flex items-center justify-between gap-4">
        <h1 className="vc-reading-serif text-[42px] font-semibold leading-none text-[#d7a05d]">设置</h1>
        <div
          data-testid="settings-account-pill"
          className="min-w-0 rounded-full border border-[#bb6d3e]/85 bg-[#07131d]/60 px-5 py-3 vc-reading-serif text-[19px] leading-none text-[#d69a60] shadow-[inset_0_0_16px_rgba(217,151,86,0.05)]"
          title={`当前账号 ${accountName}`}
        >
          <span className="whitespace-nowrap">当前账号&nbsp; {accountName}</span>
        </div>
      </div>

      <SettingsDivider className="mt-8" />

      <div className="mt-7 border-b border-[#8f5435]/70 pb-7">
        <div className="flex min-h-[58px] items-center justify-between gap-5 px-8">
          <span className="vc-reading-serif text-[28px] font-semibold leading-none text-[#dca160]">游戏指南</span>
          <button
            type="button"
            data-testid="open-game-guide-button"
            aria-label="查看游戏指南"
            onClick={() => setGuideOpen(true)}
            className="rounded-full border border-[#c97943]/85 bg-[#07131d]/55 px-8 py-3 vc-reading-serif text-[22px] leading-none text-[#dca160] transition hover:bg-[#10202a]/80 active:scale-95"
          >
            查看
          </button>
        </div>
      </div>

      <div className="border-b border-[#8f5435]/70 py-8">
        <div className="grid grid-cols-[4.7rem_minmax(0,1fr)_3.3rem_3.4rem] items-center gap-3 px-8">
          <span className="vc-reading-serif text-[28px] font-semibold leading-none text-[#dca160]">声音</span>
          <input
            type="range"
            min={0}
            max={100}
            value={safeVolume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="声音音量"
            data-testid="settings-volume-slider"
            className="h-7 w-full min-w-0 appearance-none rounded-full bg-transparent [--thumb-size:1.7rem] [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-0.6rem] [&::-webkit-slider-thumb]:h-[var(--thumb-size)] [&::-webkit-slider-thumb]:w-[var(--thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#edbd80] [&::-webkit-slider-thumb]:bg-[#c58a4d] [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(240,180,100,0.45)] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:h-[var(--thumb-size)] [&::-moz-range-thumb]:w-[var(--thumb-size)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#edbd80] [&::-moz-range-thumb]:bg-[#c58a4d]"
            style={{ background: sliderBackground }}
          />
          <span data-testid="settings-volume-percent" className="vc-reading-serif text-right text-[23px] leading-none text-[#dca160]">
            {safeVolume}%
          </span>
          <button
            type="button"
            data-testid="settings-mute-button"
            aria-label={audioMuted ? "取消静音" : "静音"}
            onClick={onToggleMute}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#bd6f3e]/90 bg-[#07131d]/65 text-[#d99a55] shadow-[0_0_14px_rgba(217,151,86,0.14),inset_0_0_12px_rgba(217,151,86,0.07)] transition hover:bg-[#10202a] active:scale-95"
          >
            <AudioIcon className="h-7 w-7" strokeWidth={1.7} />
          </button>
        </div>
      </div>

      <div className="mt-8">
        <SettingsDivider />
        <h2 className="mt-6 text-center vc-reading-serif text-[32px] font-semibold leading-none text-[#dca160]">
          阅读体验
        </h2>
        <SettingsDivider className="mx-auto mt-6 w-[92%]" />
      </div>

      <div className="mt-7 space-y-5">
        {READING_PREFERENCE_GROUPS.map((group) => (
          <div
            key={group.key}
            data-testid={`reading-preference-${group.key}`}
            className="grid grid-cols-[5.7rem_minmax(0,1fr)] items-center gap-3 rounded-[10px] border border-[#b76639]/82 bg-[#07131d]/30 px-4 py-3"
          >
            <div className="vc-reading-serif text-center text-[23px] font-semibold leading-none text-[#dca160]">
              {group.label}
            </div>
            <div className="flex gap-2">
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

      <SettingsDivider className="mt-16" />

      <div className="mt-9 grid grid-cols-2 gap-3 px-3">
        <button
          type="button"
          data-testid="open-chapter-switch-button"
          onClick={() => setChapterOpen(true)}
          className="h-16 rounded-[13px] border border-[#d09255]/90 bg-[#3b2819]/82 vc-reading-serif text-[24px] leading-none text-[#dca160] shadow-[inset_0_0_16px_rgba(237,176,104,0.08)] transition hover:bg-[#49301d] active:scale-[0.98]"
        >
          切换章节
        </button>
        <button
          type="button"
          data-testid="settings-exit-game-button"
          onClick={onExitGame}
          className="h-16 rounded-[13px] border border-[#c55342]/85 bg-[#3a0d0d]/80 vc-reading-serif text-[24px] leading-none text-[#cfa35c] shadow-[inset_0_0_16px_rgba(197,83,66,0.1)] transition hover:bg-[#4a1111] active:scale-[0.98]"
        >
          退出游戏
        </button>
      </div>

      <div className="mt-9 border-b border-[#7f4b30]/65" aria-hidden />

      <GameGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      <ChapterSwitchModal
        chapterState={chapterState}
        open={chapterOpen}
        onClose={() => setChapterOpen(false)}
        onSelectChapter={(chapterId) => {
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

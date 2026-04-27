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
      <span className="h-px flex-1 bg-gradient-to-r from-[#b85d48]/80 via-[#d28c55]/90 to-[#8c5333]/80" />
      <span className="text-[14px] leading-none text-[#9d6242]">◇</span>
      <span className="h-px flex-1 bg-gradient-to-r from-[#8c5333]/80 via-[#d28c55]/90 to-[#b85d48]/80" />
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
      className={`h-8 min-w-0 flex-1 rounded-full border vc-reading-serif text-[16px] leading-none transition active:scale-[0.98] min-[420px]:h-10 min-[420px]:text-[19px] ${
        active
          ? "border-[#f3c178]/95 bg-[#7b4e25]/92 text-[#ffd18a] shadow-[inset_0_0_18px_rgba(255,205,128,0.22),0_0_16px_rgba(232,151,77,0.28)]"
          : "border-[#9e5f38]/80 bg-[#06131c]/55 text-[#d69b61] hover:bg-[#10202a]/80"
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
      `linear-gradient(90deg, #e2a761 0%, #d59a55 ${safeVolume}%, rgba(42,55,62,0.8) ${safeVolume}%, rgba(42,55,62,0.8) 100%)`,
    [safeVolume]
  );

  return (
    <section
      data-testid="mobile-settings-panel"
      aria-label="设置"
      className="box-border h-full min-h-0 overflow-y-auto px-5 pb-[calc(var(--vc-mobile-bottom-nav-height)+0.85rem+env(safe-area-inset-bottom))] pt-[max(0.7rem,env(safe-area-inset-top))] text-[#e4a45f] [scrollbar-width:none] min-[420px]:px-6 min-[420px]:pt-[max(1.05rem,env(safe-area-inset-top))] [&::-webkit-scrollbar]:hidden"
    >
      <div className="mx-auto flex max-w-[360px] flex-col rounded-[13px] border border-[#31505a]/42 bg-[#03111a]/58 px-4 py-4 shadow-[0_0_0_1px_rgba(206,132,78,0.12),inset_0_0_42px_rgba(12,38,48,0.3)] min-[420px]:max-w-[392px] min-[420px]:px-5 min-[420px]:py-6">
        <header className="flex shrink-0 items-center gap-2 pb-4">
          <span className="vc-reading-serif text-[29px] leading-none text-[#f1ae70] drop-shadow-[0_0_12px_rgba(229,159,95,0.32)] min-[420px]:text-[36px]">
            VerseCraft
          </span>
          <MobileReadingIcons.BrandMark className="mt-1 h-7 w-7 text-[#e2a25e] min-[420px]:h-8 min-[420px]:w-8" strokeWidth={1.45} />
        </header>

        <div className="border-t border-[#7f5a44]/50 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="vc-reading-serif text-[40px] font-semibold leading-none text-[#f2ad66] min-[420px]:text-[48px]">
              设置
            </h1>
            <div
              data-testid="settings-account-pill"
              className="min-w-0 rounded-full border border-[#9f6248]/88 bg-[#06131c]/60 px-4 py-3 vc-reading-serif text-[16px] leading-none text-[#d79a60] shadow-[inset_0_0_14px_rgba(217,151,86,0.06)] min-[420px]:px-5 min-[420px]:text-[20px]"
              title={`当前账号 ${accountName}`}
            >
              <span className="block max-w-[8.7rem] truncate whitespace-nowrap min-[420px]:max-w-[10.8rem]">
                当前账号&nbsp; {accountName}
              </span>
            </div>
          </div>
        </div>

        <SettingsDivider className="my-4 shrink-0" />

        <div className="grid h-[3.55rem] shrink-0 grid-cols-[minmax(0,1fr)_6.2rem] items-center gap-4 border-b border-[#7f5a44]/50 px-4 min-[420px]:h-[4.2rem] min-[420px]:grid-cols-[minmax(0,1fr)_7.4rem] min-[420px]:px-6">
          <span className="vc-reading-serif text-[23px] font-semibold leading-none text-[#e7a765] min-[420px]:text-[30px]">
            游戏指南
          </span>
          <button
            type="button"
            data-testid="open-game-guide-button"
            aria-label="查看游戏指南"
            onClick={() => setGuideOpen(true)}
            className="h-10 rounded-full border border-[#a76940]/86 bg-[#06131c]/62 vc-reading-serif text-[19px] leading-none text-[#dda162] transition hover:bg-[#10202a]/80 active:scale-95 min-[420px]:h-[3.35rem] min-[420px]:text-[24px]"
          >
            查看
          </button>
        </div>

        <div className="grid h-[4.05rem] shrink-0 grid-cols-[3.7rem_minmax(0,1fr)_3rem_2.85rem] items-center gap-2.5 border-b border-[#7f5a44]/50 px-4 min-[420px]:h-[5.25rem] min-[420px]:grid-cols-[4.8rem_minmax(0,1fr)_3.5rem_3.65rem] min-[420px]:px-6">
          <span className="vc-reading-serif text-[23px] font-semibold leading-none text-[#e7a765] min-[420px]:text-[30px]">
            声音
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={safeVolume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="声音音量"
            data-testid="settings-volume-slider"
            className="h-7 w-full min-w-0 appearance-none rounded-full bg-transparent [--thumb-size:1.48rem] [&::-webkit-slider-runnable-track]:h-2.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-0.48rem] [&::-webkit-slider-thumb]:h-[var(--thumb-size)] [&::-webkit-slider-thumb]:w-[var(--thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#f0bd78] [&::-webkit-slider-thumb]:bg-[#d59a55] [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(240,180,100,0.45)] [&::-moz-range-track]:h-2.5 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:h-[var(--thumb-size)] [&::-moz-range-thumb]:w-[var(--thumb-size)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#f0bd78] [&::-moz-range-thumb]:bg-[#d59a55] min-[420px]:[--thumb-size:1.65rem]"
            style={{ background: sliderBackground }}
          />
          <span data-testid="settings-volume-percent" className="vc-reading-serif text-right text-[20px] leading-none text-[#e4a45f] min-[420px]:text-[25px]">
            {safeVolume}%
          </span>
          <button
            type="button"
            data-testid="settings-mute-button"
            aria-label={audioMuted ? "开启声音" : "关闭声音"}
            onClick={onToggleMute}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[#a76940]/88 bg-[#06131c]/70 text-[#e4a45f] shadow-[0_0_15px_rgba(217,151,86,0.16),inset_0_0_12px_rgba(217,151,86,0.07)] transition hover:bg-[#10202a] active:scale-95 min-[420px]:h-[3.65rem] min-[420px]:w-[3.65rem]"
          >
            <AudioIcon className="h-7 w-7 min-[420px]:h-8 min-[420px]:w-8" strokeWidth={1.8} />
          </button>
        </div>

        <SettingsDivider className="my-4 shrink-0" />
        <h2 className="text-center vc-reading-serif text-[29px] font-semibold leading-none text-[#f0aa64] min-[420px]:text-[36px]">
          阅读体验
        </h2>

        <div className="mt-4 grid shrink-0 gap-3 px-2 min-[420px]:gap-5 min-[420px]:px-3">
          {READING_PREFERENCE_GROUPS.map((group) => (
            <div
              key={group.key}
              data-testid={`reading-preference-${group.key}`}
              className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2.5 min-[420px]:grid-cols-[5rem_minmax(0,1fr)] min-[420px]:gap-4"
            >
              <div className="vc-reading-serif text-[21px] font-semibold leading-none text-[#e7a765] min-[420px]:text-[26px]">
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

        <SettingsDivider className="my-4 shrink-0" />

        <div className="grid h-[4rem] shrink-0 grid-cols-2 gap-3 px-1 min-[420px]:h-[5rem] min-[420px]:gap-4">
          <button
            type="button"
            data-testid="open-chapter-switch-button"
            onClick={() => setChapterOpen(true)}
            className="rounded-[13px] border border-[#c9874f]/92 bg-[#3d2819]/86 vc-reading-serif text-[22px] leading-none text-[#e7a765] shadow-[inset_0_0_18px_rgba(237,176,104,0.08),0_0_16px_rgba(210,146,85,0.08)] transition hover:bg-[#49301d] active:scale-[0.98] min-[420px]:text-[25px]"
          >
            切换章节
          </button>
          <button
            type="button"
            data-testid="settings-exit-game-button"
            onClick={onExitGame}
            className="rounded-[13px] border border-[#b84c42]/88 bg-[#481314]/84 vc-reading-serif text-[22px] leading-none text-[#d7a15d] shadow-[inset_0_0_18px_rgba(197,83,66,0.1),0_0_16px_rgba(197,83,66,0.08)] transition hover:bg-[#581819] active:scale-[0.98] min-[420px]:text-[25px]"
          >
            退出游戏
          </button>
        </div>
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

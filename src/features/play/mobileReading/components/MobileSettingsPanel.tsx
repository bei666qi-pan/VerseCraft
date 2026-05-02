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
    <div className={`flex items-center gap-3 text-[#8fa79f] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#ded8ce]" />
      <span className="text-[16px] leading-none">◇</span>
      <span className="h-px flex-1 bg-[#ded8ce]" />
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
      className={`h-9 min-w-0 flex-1 rounded-full border vc-reading-serif text-[17px] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition active:scale-[0.98] min-[420px]:h-10 min-[420px]:text-[20px] ${
        active
          ? "border-[#8fa79f] bg-[#8fa79f] text-white shadow-[0_8px_16px_rgba(47,116,106,0.16)]"
          : "border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

export function MobileSettingsPanel({
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
      `linear-gradient(90deg, #8fa79f 0%, #8fa79f ${safeVolume}%, #e3ded6 ${safeVolume}%, #e3ded6 100%)`,
    [safeVolume]
  );

  return (
    <section
      data-testid="mobile-settings-panel"
      aria-label="设置"
      className="box-border flex h-full min-h-0 w-full overflow-y-auto bg-[#fbf8f2] pb-[calc(var(--vc-mobile-bottom-nav-height)+0.95rem+env(safe-area-inset-bottom))] text-[#174d46] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-h-full w-full flex-col bg-[#fbf8f2] px-5 pt-[max(0.65rem,env(safe-area-inset-top))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] min-[420px]:px-6 min-[420px]:pt-[max(0.85rem,env(safe-area-inset-top))]">
        <div className="grid h-[3.7rem] shrink-0 grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 border-b border-[#ded8ce] px-2 min-[420px]:h-[4rem] min-[420px]:grid-cols-[minmax(0,1fr)_8rem]">
          <span className="vc-reading-serif text-[28px] font-semibold leading-none min-[420px]:text-[34px]">
            游戏指南
          </span>
          <button
            type="button"
            data-testid="open-game-guide-button"
            aria-label="查看游戏指南"
            onClick={() => setGuideOpen(true)}
            className="h-11 rounded-full border border-[#d8d1c6] bg-[#fffdf8] vc-reading-serif text-[20px] leading-none text-[#174d46] shadow-[0_6px_14px_rgba(73,63,51,0.08)] transition hover:bg-white active:scale-95 min-[420px]:h-12 min-[420px]:text-[24px]"
          >
            查看
          </button>
        </div>

        <div className="grid h-[4.4rem] shrink-0 grid-cols-[4.25rem_minmax(0,1fr)_3.55rem_3.35rem] items-center gap-2.5 border-b border-[#ded8ce] px-2 min-[420px]:h-[4.8rem] min-[420px]:grid-cols-[5rem_minmax(0,1fr)_4rem_3.8rem]">
          <span className="vc-reading-serif text-[28px] font-semibold leading-none min-[420px]:text-[34px]">
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
            className="h-8 w-full min-w-0 appearance-none rounded-full bg-transparent [--thumb-size:1.72rem] [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-0.5rem] [&::-webkit-slider-thumb]:h-[var(--thumb-size)] [&::-webkit-slider-thumb]:w-[var(--thumb-size)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#d8d1c6] [&::-webkit-slider-thumb]:bg-[#fffdf8] [&::-webkit-slider-thumb]:shadow-[0_5px_12px_rgba(73,63,51,0.14)] [&::-moz-range-track]:h-3 [&::-moz-range-track]:rounded-full [&::-moz-range-thumb]:h-[var(--thumb-size)] [&::-moz-range-thumb]:w-[var(--thumb-size)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#d8d1c6] [&::-moz-range-thumb]:bg-[#fffdf8]"
            style={{ background: sliderBackground }}
          />
          <span
            data-testid="settings-volume-percent"
            className="vc-reading-serif text-right text-[24px] leading-none min-[420px]:text-[29px]"
          >
            {safeVolume}%
          </span>
          <button
            type="button"
            data-testid="settings-mute-button"
            aria-label={audioMuted ? "开启声音" : "关闭声音"}
            onClick={onToggleMute}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_7px_16px_rgba(73,63,51,0.1)] transition hover:bg-white active:scale-95 min-[420px]:h-14 min-[420px]:w-14"
          >
            <AudioIcon className="h-7 w-7 min-[420px]:h-8 min-[420px]:w-8" strokeWidth={1.8} />
          </button>
        </div>

        <SettingsDivider className="my-4 shrink-0" />
        <h2 className="text-center vc-reading-serif text-[31px] font-semibold leading-none min-[420px]:text-[38px]">
          阅读体验
        </h2>

        <div className="mt-4 grid shrink-0 gap-3 px-1 min-[420px]:gap-4">
          {READING_PREFERENCE_GROUPS.map((group) => (
            <div
              key={group.key}
              data-testid={`reading-preference-${group.key}`}
              className="grid grid-cols-[4.4rem_minmax(0,1fr)] items-center gap-3 min-[420px]:grid-cols-[5.2rem_minmax(0,1fr)] min-[420px]:gap-4"
            >
              <div className="vc-reading-serif text-[25px] font-semibold leading-none min-[420px]:text-[31px]">
                {group.label}
              </div>
              <div className="flex gap-2.5 min-[420px]:gap-3">
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

        <div className="grid h-[3.9rem] shrink-0 grid-cols-2 gap-4 min-[420px]:h-[4.45rem]">
          <button
            type="button"
            data-testid="open-chapter-switch-button"
            onClick={() => setChapterOpen(true)}
            className="rounded-[16px] border border-[#d8d1c6] bg-[#fffdf8] vc-reading-serif text-[22px] leading-none text-[#174d46] shadow-[0_8px_16px_rgba(73,63,51,0.09)] transition hover:bg-white active:scale-[0.98] min-[420px]:text-[27px]"
          >
            切换章节
          </button>
          <button
            type="button"
            data-testid="settings-exit-game-button"
            onClick={onExitGame}
            className="rounded-[16px] border border-[#d8d1c6] bg-[#eef3f0] vc-reading-serif text-[22px] leading-none text-[#174d46] shadow-[0_8px_16px_rgba(73,63,51,0.09)] transition hover:bg-white active:scale-[0.98] min-[420px]:text-[27px]"
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

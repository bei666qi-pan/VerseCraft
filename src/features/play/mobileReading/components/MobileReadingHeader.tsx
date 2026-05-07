"use client";

import { MobileReadingIcons } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileReadingHeaderProps } from "../types";

export function MobileReadingHeader({
  audioMuted,
  canGoNextChapter = false,
  canGoPreviousChapter = false,
  onToggleAudio,
  onGoNextChapter,
  onGoPreviousChapter,
  pinned = false,
  title,
  variant = "default",
}: MobileReadingHeaderProps) {
  const isCodex = variant === "codex";
  const AudioIcon = audioMuted ? MobileReadingIcons.AudioOff : MobileReadingIcons.AudioOn;
  const ChevronIcon = MobileReadingIcons.OptionChevron;
  const headerClassName = pinned
    ? isCodex
      ? mobileReadingTheme.headerCodexPinned
      : mobileReadingTheme.headerPinned
    : isCodex
      ? mobileReadingTheme.headerCodex
      : mobileReadingTheme.header;
  const brandClassName = isCodex ? mobileReadingTheme.headerBrandCodex : mobileReadingTheme.headerBrand;
  const logoGroupClassName = isCodex ? mobileReadingTheme.headerCodexLogoGroup : mobileReadingTheme.headerLogoGroup;
  return (
    <>
      <header data-testid="mobile-reading-header" className={headerClassName}>
        <div className={mobileReadingTheme.headerRow}>
          <div className={brandClassName}>
            <div className={logoGroupClassName}>
              {isCodex ? (
                <MobileReadingIcons.BrandMark className={mobileReadingTheme.brandMarkCodex} strokeWidth={1.5} />
              ) : null}
              <span className={isCodex ? mobileReadingTheme.brandWordmarkCodex : mobileReadingTheme.brandWordmark}>
                VerseCraft
              </span>
              {!isCodex ? (
                <MobileReadingIcons.BrandMark className={mobileReadingTheme.brandMark} strokeWidth={1.5} />
              ) : null}
            </div>
            <span className={isCodex ? mobileReadingTheme.brandDividerCodex : mobileReadingTheme.brandDivider} aria-hidden />
            <span
              data-testid="mobile-reading-chapter-title"
              className={isCodex ? mobileReadingTheme.chapterTitleCodex : mobileReadingTheme.chapterTitle}
            >
              {title}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isCodex ? (
              <>
                <button
                  type="button"
                  onClick={onGoPreviousChapter}
                  disabled={!canGoPreviousChapter || !onGoPreviousChapter}
                  aria-label="切到上一章"
                  title="上一章"
                  data-testid="chapter-top-prev-button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_6px_14px_rgba(69,58,45,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] transition enabled:hover:bg-white enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronIcon className="h-5 w-5 rotate-180" strokeWidth={1.9} />
                </button>
                <button
                  type="button"
                  onClick={onGoNextChapter}
                  disabled={!canGoNextChapter || !onGoNextChapter}
                  aria-label="切到下一章"
                  title="下一章"
                  data-testid="chapter-top-next-button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8d1c6] bg-[#fffdf8] text-[#174d46] shadow-[0_6px_14px_rgba(69,58,45,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] transition enabled:hover:bg-white enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronIcon className="h-5 w-5" strokeWidth={1.9} />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={onToggleAudio}
              aria-label={audioMuted ? "开启声音" : "关闭声音"}
              data-testid="audio-toggle-button"
              className={isCodex ? mobileReadingTheme.audioButtonCodex : mobileReadingTheme.audioButton}
            >
              <AudioIcon className={isCodex ? mobileReadingTheme.audioIconCodex : mobileReadingTheme.audioIcon} strokeWidth={1.9} />
            </button>
          </div>
        </div>
      </header>
      {pinned ? (
        <div data-testid="mobile-reading-header-spacer" aria-hidden className={mobileReadingTheme.headerSpacer} />
      ) : null}
    </>
  );
}

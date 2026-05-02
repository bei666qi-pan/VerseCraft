"use client";

import { MobileReadingIcons } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileReadingHeaderProps } from "../types";

export function MobileReadingHeader({
  audioMuted,
  onToggleAudio,
  pinned = false,
  title = "第六章：雾港来信",
  variant = "default",
}: MobileReadingHeaderProps) {
  const isCodex = variant === "codex";
  const AudioIcon = audioMuted ? MobileReadingIcons.AudioOff : MobileReadingIcons.AudioOn;
  const headerClassName = pinned
    ? isCodex
      ? mobileReadingTheme.headerCodexPinned
      : mobileReadingTheme.headerPinned
    : isCodex
      ? mobileReadingTheme.headerCodex
      : mobileReadingTheme.header;
  return (
    <>
      <header data-testid="mobile-reading-header" className={headerClassName}>
        <div className={mobileReadingTheme.headerRow}>
          <div className={mobileReadingTheme.headerBrand}>
            <div className={isCodex ? mobileReadingTheme.headerCodexLogoGroup : "flex shrink-0 items-center gap-1"}>
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
            <span className={isCodex ? mobileReadingTheme.chapterTitleCodex : mobileReadingTheme.chapterTitle}>{title}</span>
          </div>

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
      </header>
      {pinned ? (
        <div data-testid="mobile-reading-header-spacer" aria-hidden className={mobileReadingTheme.headerSpacer} />
      ) : null}
    </>
  );
}

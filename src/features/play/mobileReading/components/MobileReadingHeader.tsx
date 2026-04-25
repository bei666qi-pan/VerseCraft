"use client";

import { MobileReadingIcons } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileReadingHeaderProps } from "../types";

export function MobileReadingHeader({ audioMuted, onToggleAudio }: MobileReadingHeaderProps) {
  const AudioIcon = audioMuted ? MobileReadingIcons.AudioOff : MobileReadingIcons.AudioOn;
  return (
    <header data-testid="mobile-reading-header" className={mobileReadingTheme.header}>
      <div className={mobileReadingTheme.headerRow}>
        <div className={mobileReadingTheme.headerBrand}>
          <div className="flex shrink-0 items-center gap-1">
            <span className={mobileReadingTheme.brandWordmark}>VerseCraft</span>
            <MobileReadingIcons.BrandMark className={mobileReadingTheme.brandMark} strokeWidth={1.5} />
          </div>
          <span className={mobileReadingTheme.brandDivider} aria-hidden />
          <span className={mobileReadingTheme.chapterTitle}>第六章：雾港来信</span>
        </div>

        <button
          type="button"
          onClick={onToggleAudio}
          aria-label={audioMuted ? "开启声音" : "关闭声音"}
          className={mobileReadingTheme.audioButton}
        >
          <AudioIcon className={mobileReadingTheme.audioIcon} strokeWidth={1.9} />
        </button>
      </div>
    </header>
  );
}

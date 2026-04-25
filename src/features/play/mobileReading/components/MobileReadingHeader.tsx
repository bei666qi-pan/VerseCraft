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
            <span className="whitespace-nowrap text-[25px] leading-none text-[#f1b586] drop-shadow-[0_0_10px_rgba(219,148,94,0.3)]">
              VerseCraft
            </span>
            <MobileReadingIcons.BrandMark className="mt-1 h-5 w-5 shrink-0 text-[#d89b6c]" strokeWidth={1.5} />
          </div>
          <span className="h-10 w-px shrink-0 bg-[#d4a076]/55" aria-hidden />
          <span className="shrink-0 whitespace-nowrap text-[18px] leading-none text-[#e5bd93]">
            第六章：雾港来信
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleAudio}
          aria-label={audioMuted ? "开启声音" : "关闭声音"}
          className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border border-[#d99769]/80 bg-[#07131d]/70 text-[#efb17f] shadow-[0_0_18px_rgba(217,151,105,0.2),inset_0_0_14px_rgba(217,151,105,0.08)] transition hover:bg-[#0b1924] active:scale-95"
        >
          <AudioIcon className="h-6 w-6" strokeWidth={1.9} />
        </button>
      </div>
    </header>
  );
}

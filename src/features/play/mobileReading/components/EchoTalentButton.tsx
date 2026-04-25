"use client";

import { MobileReadingIcons } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { EchoTalentButtonProps } from "../types";

export function EchoTalentButton({ label, ready, onUseTalent }: EchoTalentButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!ready) return;
        onUseTalent?.();
      }}
      disabled={!ready}
      aria-label={label}
      title={label}
      data-testid="echo-talent-button"
      className={`${mobileReadingTheme.iconButton} h-[46px] w-[46px] enabled:hover:bg-[#0d1d2a] enabled:active:scale-95 disabled:opacity-95`}
    >
      <MobileReadingIcons.Talent className="h-7 w-7" strokeWidth={1.85} />
    </button>
  );
}

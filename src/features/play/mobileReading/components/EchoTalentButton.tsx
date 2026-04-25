"use client";

import { MobileReadingTalentIcon } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { EchoTalentButtonProps } from "../types";

export function EchoTalentButton({ label, ready, talentName, onUseTalent }: EchoTalentButtonProps) {
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
      className={`${mobileReadingTheme.iconButton} ${mobileReadingTheme.talentButton}`}
    >
      <MobileReadingTalentIcon
        talentName={talentName}
        className={mobileReadingTheme.talentIcon}
        strokeWidth={1.85}
      />
    </button>
  );
}

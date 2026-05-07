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
      data-ready={ready ? "true" : "false"}
      style={
        ready
          ? undefined
          : { opacity: 0.62, filter: "saturate(0.72) brightness(0.86) contrast(0.9)" }
      }
      className={`${mobileReadingTheme.iconButton} ${mobileReadingTheme.talentButton} ${
        ready ? mobileReadingTheme.talentButtonReady : mobileReadingTheme.talentButtonCooling
      }`}
    >
      <MobileReadingTalentIcon
        talentName={talentName}
        className={mobileReadingTheme.talentIcon}
        strokeWidth={1.85}
      />
    </button>
  );
}

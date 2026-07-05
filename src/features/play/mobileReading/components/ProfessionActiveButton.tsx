"use client";

import { MobileReadingIcons } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { ProfessionActiveButtonProps } from "../types";

/**
 * 职业主动技能按钮。
 * - 镜像 EchoTalentButton 的交互与视觉语言（同一套 dock pill、同一组 theme token），
 *   避免在行动栏里出现两套不一致的按钮风格。
 * - 修复：`activateProfessionActive()` 此前在 store 里完整实现（发动/冷却/tip），
 *   但没有任何 UI 能触发它。只在已认证职业时渲染（未认证时不占位，避免行动栏拥挤）。
 */
export function ProfessionActiveButton({ label, ready, cooldownText, onUseProfessionActive }: ProfessionActiveButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!ready) return;
        onUseProfessionActive?.();
      }}
      disabled={!ready}
      aria-label={cooldownText ? `${label}（${cooldownText}）` : label}
      title={cooldownText ? `${label}（${cooldownText}）` : label}
      data-testid="profession-active-button"
      data-ready={ready ? "true" : "false"}
      style={
        ready
          ? { filter: "hue-rotate(150deg) saturate(1.05)" }
          : { opacity: 0.62, filter: "hue-rotate(150deg) saturate(0.6) brightness(0.86) contrast(0.9)" }
      }
      className={`${mobileReadingTheme.iconButton} ${mobileReadingTheme.talentButton} ${
        ready ? `${mobileReadingTheme.talentButtonReady} vc-echo-glow` : mobileReadingTheme.talentButtonCooling
      }`}
    >
      <MobileReadingIcons.Talent className={mobileReadingTheme.talentIcon} strokeWidth={1.85} />
    </button>
  );
}

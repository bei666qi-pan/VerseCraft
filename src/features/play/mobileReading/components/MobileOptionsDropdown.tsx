"use client";

import { LOCATION_LABELS } from "@/features/play/render/locationLabels";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";
import { MobileReadingIcons } from "../icons";
import { mobileReadingTheme } from "../theme";
import type { MobileOptionsDropdownProps } from "../types";

const OPTION_SLOT_COUNT = 4;
const LOCATION_KEYS_DESC = Object.keys(LOCATION_LABELS).sort((a, b) => b.length - a.length);

function localizeOptionLabel(label: string): string {
  const base = typeof label === "string" ? label : "";
  if (!base) return "";
  let out = base;
  for (const k of LOCATION_KEYS_DESC) {
    const zh = LOCATION_LABELS[k];
    if (!zh) continue;
    out = out.split(k).join(zh);
  }
  return out;
}

export function MobileOptionsDropdown({
  options,
  isLowSanity: _isLowSanity,
  isDarkMoon: _isDarkMoon,
  disabled,
  onPick,
  revealed = true,
}: MobileOptionsDropdownProps) {
  void _isLowSanity;
  void _isDarkMoon;

  const safeOptions = filterNarrativeActionOptions(Array.isArray(options) ? options : [], OPTION_SLOT_COUNT);
  const slots = Array.from({ length: OPTION_SLOT_COUNT }, (_, i) => {
    const t = safeOptions[i];
    return typeof t === "string" ? t.trim() : "";
  });

  return (
    <div data-testid="mobile-options-dropdown" className={mobileReadingTheme.optionsDropdown}>
      {slots.map((label, idx) => {
        const hasLabel = label.length > 0;
        const displayLabel = hasLabel ? localizeOptionLabel(label) : "";
        const showText = revealed && hasLabel;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(label)}
            disabled={disabled || !showText}
            aria-hidden={!showText}
            data-testid="mobile-option-item"
            data-option-index={idx}
            className={`${mobileReadingTheme.optionRow} ${
              idx === slots.length - 1 ? "" : mobileReadingTheme.optionRowDivider
            } ${showText ? mobileReadingTheme.optionRowInteractive : mobileReadingTheme.optionRowHidden}`}
          >
            <span
              className={`${mobileReadingTheme.optionLabel} ${
                showText ? mobileReadingTheme.optionLabelVisible : mobileReadingTheme.optionLabelHidden
              }`}
            >
              {hasLabel ? displayLabel : "\u00a0"}
            </span>
            <MobileReadingIcons.OptionChevron
              className={`${mobileReadingTheme.optionChevron} ${
                showText ? mobileReadingTheme.optionChevronVisible : mobileReadingTheme.optionChevronHidden
              }`}
              strokeWidth={1.7}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

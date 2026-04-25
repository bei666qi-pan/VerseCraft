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
            className={`flex min-h-[66px] w-full items-center justify-between gap-4 border-[#38505d]/55 px-6 text-left transition ${
              idx === slots.length - 1 ? "" : "border-b"
            } ${showText ? "hover:bg-[#102232]/85" : "pointer-events-none"} disabled:cursor-not-allowed disabled:opacity-70`}
          >
            <span
              className={`block min-w-0 flex-1 truncate vc-reading-serif text-[22px] leading-none text-[#e7bb8f] transition-opacity duration-300 ${
                showText ? "opacity-100" : "select-none opacity-0"
              }`}
            >
              {hasLabel ? displayLabel : "\u00a0"}
            </span>
            <MobileReadingIcons.OptionChevron
              className={`h-6 w-6 shrink-0 text-[#d9a37c] transition-opacity ${showText ? "opacity-90" : "opacity-0"}`}
              strokeWidth={1.7}
              aria-hidden
            />
          </button>
        );
      })}
    </div>
  );
}

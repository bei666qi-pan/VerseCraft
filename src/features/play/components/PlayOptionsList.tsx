"use client";

import { LOCATION_LABELS } from "@/features/play/render/locationLabels";
import { filterNarrativeActionOptions } from "@/lib/play/optionQuality";

const OPTION_SLOT_COUNT = 4;

const LOCATION_KEYS_DESC = Object.keys(LOCATION_LABELS).sort((a, b) => b.length - a.length);

function localizeOptionLabel(label: string): string {
  const base = typeof label === "string" ? label : "";
  if (!base) return "";
  let out = base;
  for (const k of LOCATION_KEYS_DESC) {
    const zh = LOCATION_LABELS[k];
    if (!zh) continue;
    // Keep floor shorthands (B1 / 1F / F1 ...) intact; only replace full location keys.
    out = out.split(k).join(zh);
  }
  return out;
}

export function PlayOptionsList({
  options,
  isLowSanity: _isLowSanity,
  isDarkMoon: _isDarkMoon,
  disabled,
  onPick,
  revealed = true,
}: {
  options: string[];
  isLowSanity: boolean;
  isDarkMoon: boolean;
  disabled: boolean;
  onPick: (option: string) => void;
  /** 为 false 时槽位边框/背景保持，仅文案淡出，减轻一帧布局跳变 */
  revealed?: boolean;
}) {
  void _isLowSanity;
  void _isDarkMoon;
  const safeOptions = filterNarrativeActionOptions(Array.isArray(options) ? options : [], OPTION_SLOT_COUNT);
  const slots = Array.from({ length: OPTION_SLOT_COUNT }, (_, i) => {
    const t = safeOptions[i];
    return typeof t === "string" ? t.trim() : "";
  });

  const optionTextColor = "text-slate-900";
  const optionBorderAndBg = "border border-slate-200 bg-white hover:bg-slate-50";

  return (
    <div className="mt-2 space-y-2">
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
            className={`w-full min-h-[52px] rounded-2xl px-4 py-4 text-left shadow-sm transition-shadow duration-300 md:min-h-[56px] ${
              optionBorderAndBg
            } ${showText ? "hover:shadow-md" : "pointer-events-none"} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span
              className={`block text-sm font-medium tracking-wide transition-opacity duration-300 ease-out md:text-base ${optionTextColor} ${
                showText ? "opacity-100" : "opacity-0 select-none"
              }`}
            >
              {hasLabel ? displayLabel : "\u00a0"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

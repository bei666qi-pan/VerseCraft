"use client";

import { ChevronRight } from "lucide-react";
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
  /** When false, keep row geometry but fade text out to avoid a one-frame layout jump. */
  revealed?: boolean;
}) {
  void _isLowSanity;
  void _isDarkMoon;
  const safeOptions = filterNarrativeActionOptions(Array.isArray(options) ? options : [], OPTION_SLOT_COUNT);
  const slots = Array.from({ length: OPTION_SLOT_COUNT }, (_, i) => {
    const t = safeOptions[i];
    return typeof t === "string" ? t.trim() : "";
  });

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-[8px] border border-[#c4936d]/60 bg-[#0a1722]/96 shadow-[0_12px_34px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(236,181,137,0.06)]">
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
            <ChevronRight
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

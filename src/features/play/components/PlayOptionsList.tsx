"use client";

const OPTION_SLOT_COUNT = 4;

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
  const slots = Array.from({ length: OPTION_SLOT_COUNT }, (_, i) => {
    const t = options[i];
    return typeof t === "string" ? t.trim() : "";
  });

  const optionTextColor = "text-slate-900";
  const optionBorderAndBg = "border border-slate-200 bg-white hover:bg-slate-50";

  return (
    <div className="mt-2 space-y-2">
      {slots.map((label, idx) => {
        const hasLabel = label.length > 0;
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
              {hasLabel ? label : "\u00a0"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

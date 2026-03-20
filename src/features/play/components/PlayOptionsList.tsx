"use client";

export function PlayOptionsList({
  options,
  isLowSanity,
  isDarkMoon,
  disabled,
  onPick,
}: {
  options: string[];
  isLowSanity: boolean;
  isDarkMoon: boolean;
  disabled: boolean;
  onPick: (option: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {options.map((option, idx) => {
        const optionTextColor = isLowSanity
          ? "text-white"
          : isDarkMoon
            ? "text-red-100"
            : "text-slate-900";
        const optionBorderAndBg =
          isLowSanity || isDarkMoon
            ? "border border-white/15 bg-slate-900/40 hover:bg-slate-900/60"
            : "border border-slate-200 bg-white hover:bg-slate-50";
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onPick(option)}
            disabled={disabled}
            className={`w-full rounded-2xl px-4 py-4 text-left text-sm font-medium tracking-wide shadow-sm transition-all duration-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 md:text-base ${optionTextColor} ${optionBorderAndBg}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

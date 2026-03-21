"use client";

/** 主文案背后一层淡淡液态玻璃，无弹层，整块可点 */
const WRAP =
  "relative flex min-h-[5.5rem] flex-col overflow-hidden rounded-[2rem] shadow-[0_0_28px_rgba(148,163,184,0.12)] transition-all duration-300 hover:shadow-[0_0_36px_rgba(148,163,184,0.18)] md:min-h-[6rem]";

const UNDERLAY =
  "pointer-events-none absolute inset-0 rounded-[2rem] bg-white/40 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]";

const BUTTON_BASE =
  "relative z-10 flex min-h-[5.5rem] w-full flex-1 items-center justify-center bg-transparent px-6 py-8 text-base font-semibold tracking-[0.2em] text-slate-600 transition-all duration-300 hover:text-slate-800 active:scale-[0.99] md:min-h-[6rem] md:text-lg touch-manipulation";

type Props = {
  label: string;
  onClick: () => void;
  error?: string | null;
};

export function GlassCtaButton({ label, onClick, error }: Props) {
  return (
    <div className={WRAP}>
      <span className={UNDERLAY} aria-hidden />
      <button type="button" onClick={onClick} className={BUTTON_BASE}>
        {label}
      </button>
      {error ? (
        <p className="relative z-10 bg-red-50/70 px-6 py-2 text-center text-sm text-red-500/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          {error}
        </p>
      ) : null}
    </div>
  );
}

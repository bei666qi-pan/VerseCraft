"use client";

const GLASS_PANEL =
  "rounded-[2rem] border border-slate-200/50 bg-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_24px_rgba(148,163,184,0.08)] backdrop-blur-2xl";

const BUTTON_BASE =
  "flex min-h-[5.5rem] flex-1 items-center justify-center px-6 py-8 text-base font-semibold tracking-[0.2em] text-slate-600 transition-all duration-300 hover:bg-white/60 hover:text-slate-700 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] active:scale-[0.99] md:min-h-[6rem] md:text-lg touch-manipulation";

type Props = {
  label: string;
  onClick: () => void;
  error?: string | null;
};

export function GlassCtaButton({ label, onClick, error }: Props) {
  return (
    <div
      className={`relative flex min-h-[5.5rem] flex-col ${GLASS_PANEL} overflow-hidden transition-all duration-300 hover:bg-slate-50/80 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_32px_rgba(148,163,184,0.12)] md:min-h-[6rem]`}
    >
      <button type="button" onClick={onClick} className={BUTTON_BASE}>
        {label}
      </button>
      {error ? (
        <p className="border-t border-slate-200/50 bg-red-50/60 px-6 py-2 text-center text-sm text-red-500/90">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import type { ReactNode } from "react";

/** 主文案背后一层淡淡液态玻璃，无弹层，整块可点 */
const WRAP_CARD =
  "relative flex min-h-[5.5rem] flex-col overflow-hidden rounded-[2rem] shadow-[0_0_28px_rgba(148,163,184,0.12)] transition-all duration-300 hover:shadow-[0_0_36px_rgba(148,163,184,0.18)] md:min-h-[6rem]";

const UNDERLAY_CARD =
  "pointer-events-none absolute inset-0 rounded-[2rem] bg-white/40 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]";

const BUTTON_CARD =
  "group relative z-10 flex min-h-[5.5rem] w-full flex-1 items-center justify-center bg-transparent px-6 py-8 text-base font-semibold tracking-[0.2em] text-slate-600 transition-all duration-300 hover:text-slate-800 active:scale-[0.99] md:min-h-[6rem] md:text-lg touch-manipulation";

const WRAP_PILL =
  "relative flex w-full min-h-0 flex-col overflow-hidden rounded-full shadow-[0_0_24px_rgba(148,163,184,0.14)] transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_32px_rgba(148,163,184,0.2)] active:scale-[0.99]";

const UNDERLAY_PILL =
  "pointer-events-none absolute inset-0 rounded-full bg-white/38 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]";

const BUTTON_PILL =
  "group relative z-10 flex w-full min-h-0 items-center justify-center gap-3 rounded-full bg-transparent px-10 py-4 text-base font-bold tracking-widest text-slate-800 transition-all duration-300 hover:text-slate-900 active:scale-[0.99] md:px-12 md:py-5 touch-manipulation";

type Props = {
  label: string;
  onClick: () => void;
  error?: string | null;
  className?: string;
  variant?: "card" | "pill";
  /** 仅 pill：右侧箭头等 */
  trailing?: ReactNode;
};

export function GlassCtaButton({ label, onClick, error, className = "", variant = "card", trailing }: Props) {
  const wrap = variant === "pill" ? WRAP_PILL : WRAP_CARD;
  const underlay = variant === "pill" ? UNDERLAY_PILL : UNDERLAY_CARD;
  const btn = variant === "pill" ? BUTTON_PILL : BUTTON_CARD;
  return (
    <div className={`${wrap} ${className}`.trim()}>
      <span className={underlay} aria-hidden />
      <button type="button" onClick={onClick} className={btn}>
        <span className="relative z-10">{label}</span>
        {trailing ? (
          <span className="relative z-10 text-slate-400 transition-transform duration-300 group-hover:translate-x-1">{trailing}</span>
        ) : null}
      </button>
      {error ? (
        <p className="relative z-10 rounded-2xl bg-red-50/70 px-6 py-2 text-center text-sm text-red-500/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          {error}
        </p>
      ) : null}
    </div>
  );
}

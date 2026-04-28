import type { ButtonHTMLAttributes, ReactNode } from "react";
import { VerseCraftLogoMark } from "@/components/VerseCraftLogo";

const PAPER_TEXT = "text-[#164f4d]";
const PAPER_LINE = "border-[#d8d3ca]";
const PAPER_SHADOW =
  "shadow-[0_18px_36px_rgba(62,72,68,0.10),inset_0_1px_0_rgba(255,255,255,0.88),inset_0_-2px_5px_rgba(106,100,88,0.06)]";

export function VerseCraftPaperFrame({
  children,
  className = "",
  contentClassName = "",
  dataTestId,
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  dataTestId?: string;
}) {
  return (
    <main
      data-testid={dataTestId}
      className={`relative min-h-[100dvh] overflow-x-hidden bg-[#f7f3ec] ${PAPER_TEXT} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(92deg,rgba(36,75,71,0.018)_0px,rgba(36,75,71,0.018)_1px,transparent_1px,transparent_24px),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(239,234,225,0.92))]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-55 [background-image:radial-gradient(rgba(120,112,96,0.09)_0.7px,transparent_0.7px)] [background-size:9px_9px]"
        aria-hidden
      />
      <div className={`relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[470px] flex-col px-7 ${contentClassName}`}>
        {children}
      </div>
    </main>
  );
}

export function VerseCraftPaperMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full border border-[#ded9d1] bg-[#f8f5ef]/72 ${PAPER_SHADOW} ${className}`}
      aria-hidden
    >
      <VerseCraftLogoMark className="h-[118%] w-[118%]" sizes="64px" />
    </span>
  );
}

export function VerseCraftPaperBrand({
  className = "",
  markClassName = "h-12 w-12",
  textClassName = "text-[30px]",
  text = "VERSECRAFT",
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  text?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-4 ${className}`}>
      <VerseCraftPaperMark className={markClassName} />
      <span className={`vc-reading-serif truncate font-semibold leading-none text-[#164f4d] ${textClassName}`}>
        {text}
      </span>
    </div>
  );
}

export function VerseCraftPaperDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-[#8fa4a2] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-[#d8d3ca]" />
      <span className="text-[18px] leading-none">◆</span>
      <span className="h-px flex-1 bg-[#d8d3ca]" />
    </div>
  );
}

export function VerseCraftPaperSectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      <h2 className="vc-reading-serif text-[24px] font-semibold leading-none text-[#164f4d]">
        {children}
      </h2>
      <div className="mt-1.5 flex w-[9.8rem] items-center gap-2 text-[#164f4d]" aria-hidden>
        <span className="h-px flex-1 bg-[#b8b5ad]" />
        <span className="text-[13px] leading-none">◆</span>
        <span className="h-px w-10 bg-[#d8d3ca]" />
      </div>
    </header>
  );
}

export function VerseCraftPaperPillButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`relative flex min-h-16 w-full items-center justify-center gap-4 rounded-full border ${PAPER_LINE} bg-[#f8f5ef]/88 px-8 vc-reading-serif text-[28px] font-semibold leading-none text-[#164f4d] ${PAPER_SHADOW} transition hover:bg-[#fbf8f3] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
    >
      {children}
    </button>
  );
}

export function VerseCraftPaperCircleButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full border ${PAPER_LINE} bg-[#f8f5ef]/90 text-[#164f4d] ${PAPER_SHADOW} transition hover:bg-[#fbf8f3] active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

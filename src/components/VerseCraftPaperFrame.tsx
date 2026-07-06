import type { ButtonHTMLAttributes, ReactNode } from "react";
import { VerseCraftLogoMark } from "@/components/VerseCraftLogo";

const PAPER_TEXT = "text-vc-ink";
const PAPER_LINE = "border-vc-line";
const PAPER_SHADOW = "vc-shadow-card";

export function VerseCraftPaperFrame({
  children,
  className = "",
  contentClassName = "",
  dataTestId,
  fixedViewport = false,
  maxWidthClassName = "max-w-[470px]",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  dataTestId?: string;
  fixedViewport?: boolean;
  /** 内容列宽度：桌面端可传 lg: 覆盖（默认与旧行为一致） */
  maxWidthClassName?: string;
}) {
  const frameClassName = fixedViewport
    ? "h-[calc(var(--vc-vh,1svh)_*_100)] min-h-[calc(var(--vc-vh,1svh)_*_100)] overflow-hidden sm:h-auto sm:min-h-[calc(var(--vc-vh,1svh)_*_100)] sm:overflow-x-hidden sm:overflow-y-visible"
    : "min-h-[calc(var(--vc-vh,1svh)_*_100)] overflow-x-hidden";
  const contentFrameClassName = fixedViewport
    ? "h-full min-h-0 sm:h-auto sm:min-h-[calc(var(--vc-vh,1svh)_*_100)]"
    : "min-h-[calc(var(--vc-vh,1svh)_*_100)]";

  return (
    <main
      data-testid={dataTestId}
      className={`relative bg-vc-paper ${PAPER_TEXT} ${frameClassName} ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(92deg,rgba(36,75,71,0.018)_0px,rgba(36,75,71,0.018)_1px,transparent_1px,transparent_24px),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(239,234,225,0.92))]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-55 [background-image:radial-gradient(rgba(120,112,96,0.09)_0.7px,transparent_0.7px)] [background-size:9px_9px]"
        aria-hidden
      />
      <div className={`relative z-10 mx-auto flex w-full ${maxWidthClassName} flex-col px-7 ${contentFrameClassName} ${contentClassName}`}>
        {children}
      </div>
    </main>
  );
}

export function VerseCraftPaperMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full border border-[#ded9d1] bg-vc-paper-raised/72 ${PAPER_SHADOW} ${className}`}
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
      <span className={`vc-reading-serif truncate font-semibold leading-none text-vc-ink ${textClassName}`}>
        {text}
      </span>
    </div>
  );
}

export function VerseCraftPaperDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-vc-ink-faint ${className}`} aria-hidden>
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
      <h2 className="vc-reading-serif text-[24px] font-semibold leading-none text-vc-ink">
        {children}
      </h2>
      <div className="mt-1.5 flex w-[9.8rem] items-center gap-2 text-vc-ink" aria-hidden>
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
  tone = "paper",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** paper：描边纸质（默认）；ink：深墨实心，用于页面主行动按钮 */
  tone?: "paper" | "ink";
}) {
  const toneClass =
    tone === "ink"
      ? "border-vc-ink-deep bg-vc-ink-deep text-vc-paper-bright shadow-[0_16px_30px_rgba(13,63,57,0.26),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_6px_rgba(0,0,0,0.20)] hover:bg-vc-ink"
      : `${PAPER_LINE} bg-vc-paper-raised/88 text-vc-ink ${PAPER_SHADOW} hover:bg-vc-paper-bright`;
  return (
    <button
      {...props}
      className={`relative flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full border px-7 vc-reading-serif text-[19px] font-semibold leading-none tracking-[0.01em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${toneClass} ${className}`}
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
      className={`relative grid h-16 w-16 shrink-0 place-items-center rounded-full border ${PAPER_LINE} bg-vc-paper-raised/90 text-vc-ink ${PAPER_SHADOW} transition hover:bg-vc-paper-bright active:scale-[0.98] ${className}`}
    >
      {children}
    </button>
  );
}

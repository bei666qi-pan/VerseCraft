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
      className={`vc-page-shell relative bg-vc-paper ${PAPER_TEXT} ${frameClassName} ${className}`}
    >
      <div className="vc-page-atmosphere" aria-hidden />
      <div className="vc-paper-grain" aria-hidden />
      <div className="vc-page-vignette" aria-hidden />
      <div
        className={`relative z-10 mx-auto flex w-full ${maxWidthClassName} flex-col px-5 min-[390px]:px-7 lg:px-8 ${contentFrameClassName} ${contentClassName}`}
      >
        {children}
      </div>
    </main>
  );
}

export function VerseCraftPaperMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`vc-logo-medallion relative grid shrink-0 place-items-center rounded-full border bg-vc-paper-raised/72 ${className}`}
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
      <span
        className={`vc-reading-serif truncate font-semibold leading-none tracking-[-0.015em] text-vc-ink ${textClassName}`}
      >
        {text}
      </span>
    </div>
  );
}

export function VerseCraftPaperDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 text-vc-ink-faint ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-vc-line to-vc-line" />
      <span className="text-[14px] leading-none text-vc-accent/70">◆</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-vc-line to-vc-line" />
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
      <h2 className="vc-reading-serif text-[24px] font-semibold leading-none tracking-[-0.02em] text-vc-ink-deep">
        {children}
      </h2>
      <div className="mt-2 flex w-[9.8rem] items-center gap-2 text-vc-accent/70" aria-hidden>
        <span className="h-px flex-1 bg-gradient-to-r from-vc-accent/65 to-vc-line" />
        <span className="text-[11px] leading-none">◆</span>
        <span className="h-px w-9 bg-vc-line" />
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
      ? "border-vc-ink-deep bg-[linear-gradient(180deg,#174d48,#082f2d)] text-vc-paper-bright shadow-[0_16px_30px_rgba(8,47,45,0.24),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-2px_6px_rgba(0,0,0,0.18)] hover:brightness-[1.06]"
      : `${PAPER_LINE} bg-vc-paper-raised/82 text-vc-ink ${PAPER_SHADOW} backdrop-blur-[12px] hover:border-vc-accent/30 hover:bg-vc-paper-bright`;
  return (
    <button
      {...props}
      className={`vc-pill-button relative flex min-h-[52px] w-full items-center justify-center gap-3 rounded-full border px-7 vc-reading-serif text-[19px] font-semibold leading-none tracking-[0.01em] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55 ${toneClass} ${className}`}
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
      className={`vc-circle-button relative grid h-16 w-16 shrink-0 place-items-center rounded-full border ${PAPER_LINE} bg-vc-paper-raised/82 text-vc-ink ${PAPER_SHADOW} backdrop-blur-[12px] hover:border-vc-accent/30 hover:bg-vc-paper-bright focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55 ${className}`}
    >
      {children}
    </button>
  );
}

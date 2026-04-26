import type { ReactNode } from "react";

export function VerseCraftDarkPageFrame({
  children,
  className = "",
  contentClassName = "",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <main className={`vc-reading-surface relative min-h-[100dvh] overflow-x-hidden bg-[#020b12] text-[#e7a15f] ${className}`}>
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.22),transparent_22%,rgba(0,0,0,0.18)),linear-gradient(90deg,rgba(255,255,255,0.018)_0_1px,transparent_1px_16px)] opacity-80"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(0deg,rgba(163,79,36,0.14),transparent)]"
        aria-hidden
      />
      <div
        className={`relative z-10 mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden px-6 shadow-[0_0_82px_rgba(0,0,0,0.34)] md:border-x md:border-[#d39a70]/14 ${contentClassName}`}
      >
        {children}
      </div>
    </main>
  );
}

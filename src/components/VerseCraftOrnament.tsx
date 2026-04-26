import type { ReactNode } from "react";

type OrnamentProps = {
  className?: string;
};

export function VerseCraftOrnament({ className = "" }: OrnamentProps) {
  return (
    <div className={`flex items-center gap-0 text-[#d27a43] ${className}`} aria-hidden>
      <span className="h-px flex-1 bg-gradient-to-r from-[#b96537]/80 via-[#d58d55]/80 to-[#c06f3e]/20" />
      <span className="mx-2 text-[13px] leading-none text-[#f3a561] drop-shadow-[0_0_8px_rgba(239,143,74,0.45)]">
        ◆
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-[#c06f3e]/20 via-[#d58d55]/80 to-[#b96537]/80" />
    </div>
  );
}

export function VerseCraftSectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      <h2 className="vc-reading-serif text-[30px] font-semibold leading-none text-[#ffb767] drop-shadow-[0_0_12px_rgba(243,146,74,0.26)]">
        {children}
      </h2>
      <VerseCraftOrnament className="mt-2 w-[12rem]" />
    </header>
  );
}

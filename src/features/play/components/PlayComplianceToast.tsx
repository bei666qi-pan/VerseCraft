"use client";

import { COMPLIANCE_HINT_TEXT } from "../playConstants";

export function PlayComplianceToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[80] w-[min(92vw,720px)] -translate-x-1/2 -translate-y-1/2">
      <div className="rounded-2xl border border-slate-200/70 bg-white/92 px-5 py-4 text-center text-sm font-medium text-slate-900 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        {COMPLIANCE_HINT_TEXT}
      </div>
    </div>
  );
}

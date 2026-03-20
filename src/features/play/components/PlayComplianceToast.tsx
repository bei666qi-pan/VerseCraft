"use client";

import { COMPLIANCE_HINT_TEXT } from "../playConstants";

export function PlayComplianceToast({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[80] w-[min(92vw,720px)] -translate-x-1/2">
      <div className="rounded-2xl bg-white/5 px-4 py-3 text-center text-sm text-white/90 backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]">
        {COMPLIANCE_HINT_TEXT}
      </div>
    </div>
  );
}

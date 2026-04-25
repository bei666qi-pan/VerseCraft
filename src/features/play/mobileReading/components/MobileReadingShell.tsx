"use client";

import { mobileReadingTheme } from "../theme";
import type { MobileReadingShellProps } from "../types";

export function MobileReadingShell({ children, hitEffectActive = false }: MobileReadingShellProps) {
  return (
    <main data-testid="mobile-reading-shell" className={mobileReadingTheme.shell}>
      <div
        className={`${mobileReadingTheme.shellBody} ${
          hitEffectActive ? "animate-[sanity-hit-shake_0.5s_ease-out_2]" : ""
        }`}
      >
        {children}
      </div>
    </main>
  );
}

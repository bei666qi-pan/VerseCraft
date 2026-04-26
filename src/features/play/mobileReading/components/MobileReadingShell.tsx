"use client";

import { useEffect } from "react";
import { useGameStore } from "@/store/useGameStore";
import { readingPreferencesToCssVars } from "../readingPreferences";
import { mobileReadingTheme } from "../theme";
import type { MobileReadingShellProps } from "../types";

export function MobileReadingShell({ children, hitEffectActive = false }: MobileReadingShellProps) {
  const readingPreferences = useGameStore((s) => s.readingPreferences);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("vc-play-reading-page");
    body.classList.add("vc-play-reading-page");
    return () => {
      html.classList.remove("vc-play-reading-page");
      body.classList.remove("vc-play-reading-page");
    };
  }, []);

  return (
    <main className={mobileReadingTheme.shellFrame} style={readingPreferencesToCssVars(readingPreferences)}>
      <section data-testid="mobile-reading-shell" className={mobileReadingTheme.shell}>
        <div
          className={`${mobileReadingTheme.shellBody} ${
            hitEffectActive ? "animate-[sanity-hit-shake_0.5s_ease-out_2]" : ""
          }`}
        >
          {children}
        </div>
      </section>
    </main>
  );
}

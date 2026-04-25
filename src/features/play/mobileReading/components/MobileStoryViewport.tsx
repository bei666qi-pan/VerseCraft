"use client";

import { mobileReadingTheme } from "../theme";
import type { MobileStoryViewportProps } from "../types";

export function MobileStoryViewport({ children }: MobileStoryViewportProps) {
  return (
    <section data-testid="mobile-story-viewport" className={mobileReadingTheme.storyViewport}>
      {children}
    </section>
  );
}

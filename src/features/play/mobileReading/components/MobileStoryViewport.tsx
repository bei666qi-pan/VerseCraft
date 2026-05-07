"use client";

import { useRef } from "react";
import { mobileReadingTheme } from "../theme";
import type { MobileStoryViewportProps } from "../types";

const SWIPE_MIN_X = 64;
const SWIPE_MAX_Y = 54;

function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button,a,input,textarea,select,[role='button'],[data-swipe-ignore='true']"));
}

export function MobileStoryViewport({ children, onSwipeLeft, onSwipeRight }: MobileStoryViewportProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <section
      data-testid="mobile-story-viewport"
      className={mobileReadingTheme.storyViewport}
      onTouchStart={(event) => {
        if (shouldIgnoreSwipeTarget(event.target)) {
          touchStartRef.current = null;
          return;
        }
        const touch = event.touches[0];
        touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        const touch = event.changedTouches[0];
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < SWIPE_MIN_X) return;
        if (Math.abs(dy) > SWIPE_MAX_Y || Math.abs(dx) < Math.abs(dy) * 1.35) return;
        if (dx < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      }}
    >
      {children}
    </section>
  );
}

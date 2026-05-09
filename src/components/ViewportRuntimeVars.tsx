"use client";

import { useEffect } from "react";

export const VIEWPORT_HEIGHT_VAR = "--vc-vh";

export function computeViewportUnitPx(input: {
  visualViewportHeight?: number | null;
  innerHeight?: number | null;
}): number | null {
  const visualViewportHeight =
    typeof input.visualViewportHeight === "number" && Number.isFinite(input.visualViewportHeight)
      ? input.visualViewportHeight
      : null;
  const innerHeight =
    typeof input.innerHeight === "number" && Number.isFinite(input.innerHeight)
      ? input.innerHeight
      : null;
  const height = visualViewportHeight && visualViewportHeight > 0
    ? visualViewportHeight
    : innerHeight && innerHeight > 0
      ? innerHeight
      : null;
  if (!height) return null;
  return Math.round((height / 100) * 1000) / 1000;
}

export default function ViewportRuntimeVars() {
  useEffect(() => {
    let rafId = 0;

    const apply = () => {
      rafId = 0;
      const unit = computeViewportUnitPx({
        visualViewportHeight: window.visualViewport?.height ?? null,
        innerHeight: window.innerHeight,
      });
      if (unit == null) return;
      document.documentElement.style.setProperty(VIEWPORT_HEIGHT_VAR, `${unit}px`);
    };

    const schedule = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, []);

  return null;
}

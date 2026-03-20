"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface OnboardingStep {
  /** CSS selector for the element to spotlight */
  targetSelector: string;
  /** Tip text shown near the spotlight */
  tip: string;
  /** Arrow direction relative to target */
  arrowDirection?: "left" | "right" | "top" | "bottom";
}

interface OnboardingGuideProps {
  steps: OnboardingStep[];
  currentStep: number;
  onNext: () => void;
  onComplete: () => void;
  /** Optional: call before advancing to open modal etc. */
  onBeforeStep?: (stepIndex: number) => void;
}

function getTargetRect(selector: string): DOMRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  return el?.getBoundingClientRect() ?? null;
}

export function OnboardingGuide({
  steps,
  currentStep,
  onNext,
  onComplete,
  onBeforeStep,
}: OnboardingGuideProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const rafRef = useRef<number>(0);
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  const step = steps[currentStep];

  const updateRect = useCallback(() => {
    if (!step) return;
    const r = getTargetRect(step.targetSelector);
    setRect(r);
  }, [step]);

  useEffect(() => {
    if (!step) return;
    onBeforeStep?.(currentStep);
    const firstRaf = requestAnimationFrame(updateRect);

    const el = document.querySelector(step.targetSelector);
    if (el && typeof ResizeObserver !== "undefined") {
      const obs = new ResizeObserver(updateRect);
      obs.observe(el);
      resizeObsRef.current = obs;
      return () => {
        cancelAnimationFrame(firstRaf);
        obs.disconnect();
        resizeObsRef.current = null;
      };
    }
    return () => cancelAnimationFrame(firstRaf);
  }, [step, currentStep, onBeforeStep, updateRect]);

  useEffect(() => {
    const tick = () => {
      updateRect();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [updateRect]);

  function handleDismiss() {
    setIsExiting(true);
    setTimeout(() => {
      if (currentStep >= steps.length - 1) {
        onComplete();
      } else {
        onNext();
        setIsExiting(false);
      }
    }, 200);
  }

  if (!step || currentStep < 0 || currentStep >= steps.length) return null;

  const fallbackW = 1024;
  const fallbackH = 768;
  const cx = rect ? rect.left + rect.width / 2 : fallbackW / 2;
  const cy = rect ? rect.top + rect.height / 2 : fallbackH / 2;
  const radius = rect ? Math.max(rect.width, rect.height) * 0.75 + 20 : 100;
  const dir = step.arrowDirection ?? "bottom";

  return (
    <div
      role="presentation"
      className={`fixed inset-0 z-[70] transition-opacity duration-200 ${
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        background: `radial-gradient(circle ${radius}px at ${cx}px ${cy}px, transparent 0%, rgba(0,0,0,0.75) 100%)`,
      }}
      onClick={handleDismiss}
      onKeyDown={(e) => e.key === "Escape" && handleDismiss()}
      tabIndex={0}
      aria-label="点击任意位置继续"
    >
      {/* SVG arrow - positioned near spotlight edge, gentle bounce */}
      {rect && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: dir === "left" ? rect.left - 12 : dir === "right" ? rect.right + 12 : rect.left + rect.width / 2 - 12,
            top: dir === "top" ? rect.top - 12 : dir === "bottom" ? rect.bottom + 12 : rect.top + rect.height / 2 - 12,
            transform:
              dir === "left"
                ? "translateX(-8px)"
                : dir === "right"
                  ? "translateX(8px) rotate(180deg)"
                  : dir === "top"
                    ? "translateY(-8px) rotate(-90deg)"
                    : "translateY(8px) rotate(90deg)",
          }}
        >
          <span className="block animate-[spotlight-arrow_2s_ease-in-out_infinite]">
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" className="text-white/70 drop-shadow-lg">
              <path
                d="M12 5v14M12 19l-6-6M12 19l6-6"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      )}

      {/* Tip text - frosted glass */}
      <div
        className="absolute backdrop-blur-md bg-white/5 rounded-2xl px-5 py-4 max-w-[280px] shadow-xl"
        style={{
          left: rect ? Math.max(16, Math.min(rect.left + rect.width / 2 - 140, fallbackW - 296)) : "50%",
          top: rect
            ? dir === "bottom"
              ? rect.bottom + 28
              : dir === "top"
                ? rect.top - 120
                : rect.top + rect.height / 2 - 40
            : "50%",
          transform: rect ? "translateX(-50%)" : "translate(-50%, -50%)",
        }}
      >
        <p className="text-sm font-light text-white/95 leading-relaxed tracking-wide">{step.tip}</p>
        <p className="mt-2 text-[11px] text-white/50 font-extralight">点击任意处继续</p>
      </div>
    </div>
  );
}

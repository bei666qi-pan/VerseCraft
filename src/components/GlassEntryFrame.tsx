"use client";

import type { ReactNode } from "react";

type GlassEntryFrameProps = {
  children: ReactNode;
  /** pill：首页圆角胶囊；card：创建/引导等全宽主按钮 */
  variant?: "pill" | "card";
  className?: string;
};

/** 淡液态玻璃外框，统一「进入世界 / 创建形象 / 意识潜入」等主入口视觉 */
export function GlassEntryFrame({ children, variant = "card", className = "" }: GlassEntryFrameProps) {
  const radius = variant === "pill" ? "rounded-full" : "rounded-[2rem]";
  return (
    <div
      className={`relative inline-flex ${radius} p-[3px] shadow-[0_14px_44px_rgba(148,163,184,0.18)] ${className}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 ${radius} bg-white/42 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]`}
        aria-hidden
      />
      <div className={`relative z-10 flex w-full min-w-0 ${radius}`}>{children}</div>
    </div>
  );
}

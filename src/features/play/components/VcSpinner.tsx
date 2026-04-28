"use client";

import { memo, type CSSProperties } from "react";
import { VerseCraftLogoMark } from "@/components/VerseCraftLogo";

export const VcSpinner = memo(function VcSpinner({
  size = 24,
  strokeWidth = 3,
  tone = "blackblue",
  className,
}: {
  size?: number;
  strokeWidth?: number;
  /** Visual tone preset. */
  tone?: "blackblue" | "neutral";
  className?: string;
}) {
  const style = {
    "--vc-logo-loader-size": `${size}px`,
    "--vc-logo-loader-stroke": `${strokeWidth}px`,
  } as CSSProperties;

  return (
    <span
      className={`vc-logo-loader ${className ?? ""}`}
      data-tone={tone}
      style={style}
      aria-hidden
    >
      <VerseCraftLogoMark className="vc-logo-loader-mark h-[156%] w-[156%]" sizes={`${Math.ceil(size * 1.6)}px`} />
    </span>
  );
});


"use client";

import { memo, useId } from "react";

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
  const id = useId().replace(/:/g, "_");
  const gradId = `vcSpinGrad_${id}`;
  const r = (size - strokeWidth) / 2;
  const c = size / 2;

  const stroke =
    tone === "neutral"
      ? `url(#${gradId})`
      : `url(#${gradId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden
    >
      <defs>
        {tone === "neutral" ? (
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(15,23,42,0.55)" />
            <stop offset="55%" stopColor="rgba(148,163,184,0.65)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.45)" />
          </linearGradient>
        ) : (
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(2,6,23,0.7)" />
            <stop offset="40%" stopColor="rgba(37,99,235,0.7)" />
            <stop offset="100%" stopColor="rgba(2,6,23,0.55)" />
          </linearGradient>
        )}
      </defs>

      {/* Rim */}
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="rgba(2,6,23,0.10)"
        strokeWidth={strokeWidth}
      />

      {/* Active arc */}
      <g className="vc-wait-rotate">
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(8, Math.floor(r * 2.2))} ${Math.max(18, Math.floor(r * 3.4))}`}
        />
      </g>
    </svg>
  );
});


import type { ReactElement } from "react";

/*
 * 图鉴「尚未出现」占位画像 —— 纯矢量实现。
 * 由原 955×1647 PNG（1.48MB）程序化测绘转换（约 2KB）：
 * - 人形剪影轮廓经等值线提取 + RDP 简化（148 点，卡片尺寸下与原图不可区分）
 * - 原图的下摆渐隐直接烘焙进填充渐变（轮廓底缘处不透明度为 0，无需 mask）
 * - 相框浮雕、内高光、底部双短线均按原图量取
 * 同屏多实例时 defs id 重复无害：内容完全相同，浏览器取首个定义。
 */
const SILHOUETTE_PATH =
  "M109.2 52.2L105.7 57.2L104.5 61.1L109.2 57.8L116.8 55.4L129.0 53.4L134.4 53.8L129.5 56.9L142.2 60.0L147.4 62.5L152.8 66.5L159.4 67.5L154.5 70.0L159.3 74.5L163.4 79.8L168.6 83.2L165.1 84.2L169.4 92.0L171.1 97.5L170.8 100.2L169.0 96.7L167.3 95.2L169.7 105.2L174.1 112.2L168.7 110.5L168.3 121.7L167.2 124.3L166.2 121.1L165.3 124.5L166.3 132.0L163.1 130.0L161.9 136.8L160.3 139.8L155.9 145.8L153.3 147.8L152.8 150.9L151.4 148.2L150.8 148.4L149.2 156.3L147.5 155.5L141.9 163.5L140.8 170.8L147.8 175.2L147.7 188.2L151.2 192.9L155.5 194.5L159.8 198.4L166.8 201.8L195.5 214.0L199.2 216.5L201.3 219.5L204.0 226.8L206.7 239.2L211.3 277.2L211.5 284.2L208.2 291.4L204.9 290.8L197.8 294.0L186.0 295.2L173.7 299.9L172.5 299.6L171.7 297.4L169.3 298.6L163.2 296.6L160.7 297.6L153.7 297.2L148.4 299.3L143.3 300.0L136.7 303.9L120.3 302.9L115.4 301.0L113.4 303.5L104.0 302.6L103.3 301.9L104.4 300.4L103.9 299.7L101.3 302.3L98.8 300.1L92.1 298.5L89.9 297.0L86.6 298.6L78.7 296.2L75.1 296.9L72.7 294.8L68.1 296.9L63.9 295.9L58.7 296.4L57.2 295.6L53.4 296.9L46.4 296.0L43.3 294.7L39.3 295.2L34.3 285.9L29.2 282.9L28.2 282.8L27.2 284.0L30.4 252.8L32.8 237.8L35.8 226.0L39.3 218.5L44.2 214.2L75.0 201.7L81.5 198.4L85.1 194.8L90.0 193.1L93.5 188.5L93.7 175.2L100.8 171.0L99.9 163.8L93.8 154.8L92.0 155.8L90.9 148.2L90.2 148.1L89.2 150.0L88.5 147.8L85.4 145.2L81.8 140.2L79.6 136.0L78.7 129.8L74.9 131.8L76.3 124.2L75.5 120.5L74.2 123.9L73.5 122.8L73.4 114.2L69.1 115.8L73.0 107.8L73.0 105.3L72.0 108.6L71.3 107.5L71.7 101.8L73.5 95.2L76.7 88.8L71.5 88.9L70.0 88.2L74.5 86.0L77.8 83.3L80.9 79.2L83.2 74.0L87.2 69.3L92.2 66.0L98.2 64.4L98.9 60.5L100.5 57.7L101.7 57.0L101.5 58.6L105.1 54.8L109.2 52.2Z";

const FADE_ID = "vc-codex-ph-fade";
const SHADOW_ID = "vc-codex-ph-shadow";

export function CodexUnknownPortrait({
  className = "",
}: {
  className?: string;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 239 412"
      preserveAspectRatio="xMidYMin slice"
      xmlns="http://www.w3.org/2000/svg"
      data-testid="codex-unknown-placeholder"
      role="img"
      aria-label="尚未出现的图鉴占位图"
      className={`h-full w-full ${className}`}
    >
      <defs>
        <linearGradient id={FADE_ID} x1="0" y1="51" x2="0" y2="304" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3e5a60" />
          <stop offset="0.44" stopColor="#4c6d71" />
          <stop offset="0.56" stopColor="#4e6f74" stopOpacity="0.92" />
          <stop offset="0.68" stopColor="#507174" stopOpacity="0.8" />
          <stop offset="0.78" stopColor="#527276" stopOpacity="0.58" />
          <stop offset="0.86" stopColor="#567578" stopOpacity="0.32" />
          <stop offset="0.93" stopColor="#587678" stopOpacity="0.1" />
          <stop offset="1" stopColor="#5a787a" stopOpacity="0" />
        </linearGradient>
        <filter id={SHADOW_ID} x="-8%" y="-6%" width="116%" height="112%">
          <feDropShadow dx="0" dy="2" stdDeviation="3.2" floodColor="#c9bcaa" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* 外底 + 浮雕相框 */}
      <rect width="239" height="412" fill="#f6f0ed" />
      <rect
        x="11.5"
        y="7.5"
        width="216"
        height="396"
        rx="11"
        fill="#fbf4ef"
        stroke="#e6ddd2"
        strokeWidth="1.2"
        filter={`url(#${SHADOW_ID})`}
      />
      <rect
        x="13.2"
        y="9.2"
        width="212.6"
        height="392.6"
        rx="9.6"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.75"
      />

      {/* 人形剪影（下摆渐隐） */}
      <path d={SILHOUETTE_PATH} fill={`url(#${FADE_ID})`} />

      {/* 底部双短线（原图落款位置） */}
      <g fill="#4c6d71" fillOpacity="0.82">
        <rect x="89.5" y="374" width="27" height="2.6" rx="1.3" />
        <rect x="122.2" y="374" width="26.3" height="2.6" rx="1.3" />
      </g>
    </svg>
  );
}

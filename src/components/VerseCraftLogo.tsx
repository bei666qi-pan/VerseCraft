import { useId, type CSSProperties } from "react";

/** 旧 PNG 资源路径：favicon / OG 图等静态场景仍可引用 */
export const VERSECRAFT_LOGO_SRC = "/assets/brand/versecraft-logo.png";
export const VERSECRAFT_LOGO_TILE_SRC = "/assets/brand/versecraft-logo-tile.png";

/*
 * 「暗月四芒星」品牌标 —— 纯矢量实现（由 768×768 原 PNG 程序化测绘转换）：
 * - 主星四尖点 (386,105)/(641,388)/(386,663)/(127,388)，边缘为三次贝塞尔（拟合均差 <1px）
 * - 新月与中心星芒为镂空（fill-rule evenodd），与原 PNG 的透明通道行为一致，
 *   放在任何背景上都露出底色
 * - 外围 r≈237 圆弧：右下/左上为实线，左下/右上为虚线，两枚圆点位于弧上
 * - 髮丝十字线以 clipPath 限制在星形内部
 * 使用 useId() 为每个实例生成唯一 SVG ID，避免同页多实例时的渐变/裁剪路径引用错误。
 */

/** 主星 + 新月镂空 + 中心星芒镂空（evenodd） */
/** 四芒星/星芒生成器：rx/ry 为臂长，k 控制臂的丰腴度 */
function sparklePath(cx: number, cy: number, rx: number, ry: number, k = 0.24): string {
  const kx = rx * k;
  const ky = ry * k;
  return `M${cx} ${cy - ry}Q${cx + kx} ${cy - ky} ${cx + rx} ${cy}Q${cx + kx} ${cy + ky} ${cx} ${cy + ry}Q${cx - kx} ${cy + ky} ${cx - rx} ${cy}Q${cx - kx} ${cy - ky} ${cx} ${cy - ry}Z`;
}

const STAR_PATH = [
  // 主星（四条边独立拟合的三次贝塞尔，保留原图手绘的轻微非对称）
  "M386.5 104C386.5 308 518 388 650 388C474 388 386.5 531 386.5 663C386.5 559 324 388 116 388C296 388 386.5 268 386.5 104Z",
  // 新月（外弧/内切弧构成的透明镂空；半径含同色描边的 1px 补偿）
  "M382.8 302.2A85.2 85.2 0 1 0 453.2 428.9A76.45 76.45 0 1 1 382.8 302.2Z",
  // 中心星芒镂空（含描边补偿）
  sparklePath(387.5, 387.5, 26, 27),
].join("");

export function VerseCraftLogoMark({
  alt = "文界工坊",
  className = "",
  dataTestId,
  decorative = true,
  imageClassName = "",
  style,
}: {
  alt?: string;
  className?: string;
  dataTestId?: string;
  decorative?: boolean;
  imageClassName?: string;
  /** 兼容保留：内联 SVG 后不再需要预加载 */
  priority?: boolean;
  /** 兼容保留：内联 SVG 后不再需要响应式尺寸提示 */
  sizes?: string;
  style?: CSSProperties;
}) {
  const hasHeight = /\b(?:h-|size-)/.test(className);
  const hasWidth = /\b(?:w-|size-)/.test(className);

  const inkGradId = useId();
  const hairClipId = useId();

  return (
    <span
      aria-hidden={decorative ? true : undefined}
      data-testid={dataTestId ?? "versecraft-brand-mark"}
      className={`relative inline-block shrink-0 overflow-visible ${hasHeight ? "" : "h-10"} ${hasWidth ? "" : "w-10"} ${className}`}
      style={style}
    >
      <svg
        viewBox="0 0 768 768"
        xmlns="http://www.w3.org/2000/svg"
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : alt}
        aria-hidden={decorative ? true : undefined}
        className={`absolute inset-0 h-full w-full select-none ${imageClassName}`}
      >
        <defs>
          <linearGradient id={inkGradId} x1="386.5" y1="104" x2="386.5" y2="663" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#427473" />
            <stop offset="0.45" stopColor="#2b5d5c" />
            <stop offset="1" stopColor="#113f42" />
          </linearGradient>
          <clipPath id={hairClipId} clipRule="evenodd">
            <path d={STAR_PATH} />
          </clipPath>
        </defs>

        {/* 外围圆弧 r≈240.2（星形下层，被主星自然遮断） */}
        <g fill="none" stroke="#ada697" strokeWidth="3.2">
          {/* 右下实弧 12°→82° */}
          <path d="M615.9 433.4A240.2 240.2 0 0 1 414.4 621.4" />
          {/* 左上实弧 188°→258° */}
          <path d="M143.1 350.1A240.2 240.2 0 0 1 331.1 148.6" />
          {/* 左下虚弧 84°→163° */}
          <path d="M406.1 622.4A240.2 240.2 0 0 1 151.3 453.7" strokeDasharray="9.5 15" />
          {/* 右上虚弧 262°→342° */}
          <path d="M347.6 145.6A240.2 240.2 0 0 1 609.5 309.3" strokeDasharray="9.5 15" />
        </g>
        <circle cx="156.5" cy="435.5" r="8.8" fill="#a89e8e" />
        <circle cx="604.8" cy="342.5" r="8.8" fill="#a89e8e" />

        {/* 主星（含新月与星芒镂空）；同色细描边补偿栅格化收缩，贴合原 PNG 边缘 */}
        <path
          d={STAR_PATH}
          fill={`url(#${inkGradId})`}
          fillRule="evenodd"
          stroke={`url(#${inkGradId})`}
          strokeWidth="2"
        />

        {/* 髮丝十字线（限制在星形内部） */}
        <g clipPath={`url(#${hairClipId})`} stroke="#fbf2e9" strokeOpacity="0.16" strokeWidth="1.6">
          <line x1="386.5" y1="150" x2="386.5" y2="620" />
          <line x1="150" y1="388" x2="620" y2="388" />
        </g>

        {/* 外围小星芒（顶/右/底/左） */}
        <g fill="#235453" stroke="#235453" strokeWidth="1.6">
          <path d={sparklePath(386.5, 69, 16.5, 18)} />
          <path d={sparklePath(686.5, 388.5, 19.5, 18.5)} />
          <path d={sparklePath(387, 699, 18, 19)} />
          <path d={sparklePath(80.5, 388.5, 18.5, 18.5)} />
        </g>
      </svg>
    </span>
  );
}

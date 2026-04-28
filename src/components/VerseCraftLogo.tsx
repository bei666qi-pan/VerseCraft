import Image from "next/image";
import type { CSSProperties } from "react";

export const VERSECRAFT_LOGO_SRC = "/assets/brand/versecraft-logo.png";
export const VERSECRAFT_LOGO_TILE_SRC = "/assets/brand/versecraft-logo-tile.png";

export function VerseCraftLogoMark({
  alt = "文界工坊",
  className = "",
  dataTestId,
  decorative = true,
  imageClassName = "",
  priority = false,
  sizes = "48px",
  style,
}: {
  alt?: string;
  className?: string;
  dataTestId?: string;
  decorative?: boolean;
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
  style?: CSSProperties;
}) {
  const hasHeight = /\b(?:h-|size-)/.test(className);
  const hasWidth = /\b(?:w-|size-)/.test(className);

  return (
    <span
      aria-hidden={decorative ? true : undefined}
      data-testid={dataTestId}
      className={`relative inline-block shrink-0 overflow-visible ${hasHeight ? "" : "h-10"} ${hasWidth ? "" : "w-10"} ${className}`}
      style={style}
    >
      <Image
        src={VERSECRAFT_LOGO_SRC}
        alt={decorative ? "" : alt}
        fill
        sizes={sizes}
        className={`select-none object-contain ${imageClassName}`}
        draggable={false}
        priority={priority}
        unoptimized
      />
    </span>
  );
}

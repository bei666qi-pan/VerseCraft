"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type ChromeTheme = {
  color: string;
  colorScheme: "light" | "dark";
};

const PAPER_THEME: ChromeTheme = { color: "#f7f3ec", colorScheme: "light" };
const PLAY_THEME: ChromeTheme = { color: "#f6f2ec", colorScheme: "light" };
const INTRO_THEME: ChromeTheme = { color: "#f7f3ed", colorScheme: "light" };
const SOFT_LIGHT_THEME: ChromeTheme = { color: "#f8fafc", colorScheme: "light" };
const DARK_THEME: ChromeTheme = { color: "#030712", colorScheme: "dark" };
const SETTLEMENT_THEME: ChromeTheme = { color: "#020617", colorScheme: "dark" };

function resolveChromeTheme(pathname: string | null): ChromeTheme {
  const path = pathname ?? "/";
  if (path.startsWith("/settlement")) return SETTLEMENT_THEME;
  if (path.startsWith("/preview-access")) return DARK_THEME;
  if (path.startsWith("/play") || path.startsWith("/preview/play")) return PLAY_THEME;
  if (path.startsWith("/intro")) return INTRO_THEME;
  if (path.startsWith("/history") || path.startsWith("/legal") || path === "/preview") return SOFT_LIGHT_THEME;
  return PAPER_THEME;
}

function ensureThemeColorMeta(): HTMLMetaElement {
  const existing = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (existing) return existing;
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
  return meta;
}

export function MobileChromeTheme() {
  const pathname = usePathname();

  useEffect(() => {
    const theme = resolveChromeTheme(pathname);
    const html = document.documentElement;
    const body = document.body;
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    if (metas.length === 0) {
      ensureThemeColorMeta().content = theme.color;
    } else {
      metas.forEach((meta) => {
        meta.content = theme.color;
      });
    }
    html.style.backgroundColor = theme.color;
    body.style.backgroundColor = theme.color;
    html.style.colorScheme = theme.colorScheme;
    body.style.colorScheme = theme.colorScheme;
  }, [pathname]);

  return null;
}

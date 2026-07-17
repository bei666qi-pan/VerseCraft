"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/store/useGameStore";

/** Keeps document semantics aligned with the persisted player-facing language. */
export function LanguageDocumentSync() {
  const language = useGameStore((state) => state.language);
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.lang = language;
    if (language !== "en-US") return;
    if (pathname.startsWith("/play")) document.title = "VerseCraft · Play";
    else if (pathname.startsWith("/create")) document.title = "VerseCraft · Character Creation";
    else if (pathname.startsWith("/settlement")) document.title = "VerseCraft · Settlement";
  }, [language, pathname]);

  return null;
}

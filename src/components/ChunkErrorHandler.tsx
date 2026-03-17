"use client";

import { useEffect } from "react";

const CHUNK_ERROR_KEY = "versecraft-chunk-retry";

function isChunkLoadError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.name === "ChunkLoadError" ||
      err.message?.includes("ChunkLoadError") ||
      err.message?.includes("Loading chunk") ||
      err.message?.includes("Failed to fetch dynamically imported module")
    );
  }
  return false;
}

export default function ChunkErrorHandler() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      const err = event?.error ?? event?.message;
      if (!isChunkLoadError(err)) return;
      const refreshed = sessionStorage.getItem(CHUNK_ERROR_KEY);
      if (refreshed === "1") {
        sessionStorage.removeItem(CHUNK_ERROR_KEY);
        return;
      }
      event.preventDefault();
      sessionStorage.setItem(CHUNK_ERROR_KEY, "1");
      window.location.reload();
    };

    const unhandled = (event: PromiseRejectionEvent) => {
      const err = event?.reason;
      if (!isChunkLoadError(err)) return;
      const refreshed = sessionStorage.getItem(CHUNK_ERROR_KEY);
      if (refreshed === "1") {
        sessionStorage.removeItem(CHUNK_ERROR_KEY);
        return;
      }
      event.preventDefault();
      sessionStorage.setItem(CHUNK_ERROR_KEY, "1");
      window.location.reload();
    };

    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", unhandled);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", unhandled);
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";

const DRAIN_INTERVAL_MS = 20;
const CHARS_PER_TICK = 2;

/**
 * Gemini-style smooth stream: buffers incoming text and drains 1-2 chars per tick
 * to smooth out chunk-based SSE and eliminate "jumpy" rendering.
 * Core logic: target string grows from SSE chunks; displayed animates toward target
 * by appending CHARS_PER_TICK chars every DRAIN_INTERVAL_MS.
 */
export function useSmoothStream(source: string, isActive: boolean): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const [hasShownContent, setHasShownContent] = useState(false);
  const sourceRef = useRef(source);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  /* eslint-disable react-hooks/set-state-in-effect -- sync reset when stream starts/ends is intentional */
  useEffect(() => {
    const streamJustStarted = isActive && !prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (!isActive) {
      setDisplayed(source);
      setHasShownContent(false);
      return;
    }
    if (streamJustStarted) setHasShownContent(false);
    setDisplayed("");
  }, [isActive, source]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setDisplayed((prev) => {
        const target = sourceRef.current;
        if (prev.length >= target.length) return prev;
        const take = Math.min(CHARS_PER_TICK, target.length - prev.length);
        return target.slice(0, prev.length + take);
      });
    }, DRAIN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isActive]);

  /* eslint-disable react-hooks/set-state-in-effect -- latch: once content shown, never show spinner again */
  useEffect(() => {
    if (displayed.length > 0) setHasShownContent(true);
  }, [displayed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const text = isActive ? (displayed || "……") : source;
  const isComplete = !isActive;
  const isThinking = isActive && displayed.length === 0 && !hasShownContent;

  return { text, isComplete, isThinking };
}

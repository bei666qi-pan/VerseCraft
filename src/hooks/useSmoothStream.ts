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
export function useSmoothStream(source: string, isActive: boolean): { text: string; isComplete: boolean } {
  const [displayed, setDisplayed] = useState("");
  const sourceRef = useRef(source);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  /* eslint-disable react-hooks/set-state-in-effect -- sync reset when stream starts/ends is intentional */
  useEffect(() => {
    if (!isActive) {
      setDisplayed(source);
      return;
    }
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

  const text = isActive ? (displayed || "……") : source;
  const isComplete = !isActive;
  const isThinking = isActive && displayed.length === 0;

  return { text, isComplete, isThinking };
}

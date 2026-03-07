"use client";

import { useEffect, useRef, useState } from "react";

const CHARS_PER_FRAME = 2;

/**
 * Grok-style stream: Delta append via queue + requestAnimationFrame.
 * `displayed` only ever grows during an active stream, so once content
 * appears the spinner can never flash back.
 */
export function useSmoothStream(source: string, isActive: boolean): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const queueRef = useRef("");
  const prevSourceLenRef = useRef(0);
  const prevActiveRef = useRef(isActive);

  /* eslint-disable react-hooks/set-state-in-effect -- reset on stream start/end */
  useEffect(() => {
    const streamJustStarted = isActive && !prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (!isActive) {
      setDisplayed(source);
      queueRef.current = "";
      prevSourceLenRef.current = source.length;
      return;
    }
    if (streamJustStarted) {
      setDisplayed("");
      queueRef.current = "";
      prevSourceLenRef.current = 0;
    }
  }, [isActive, source]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isActive) return;
    if (source.length > prevSourceLenRef.current) {
      const delta = source.slice(prevSourceLenRef.current);
      queueRef.current += delta;
      prevSourceLenRef.current = source.length;
    }
  }, [source, isActive]);

  useEffect(() => {
    if (!isActive) return;
    let rafId: number;

    function drain() {
      const q = queueRef.current;
      if (q.length > 0) {
        const take = Math.min(CHARS_PER_FRAME, q.length);
        const chunk = q.slice(0, take);
        queueRef.current = q.slice(take);
        setDisplayed((prev) => prev + chunk);
      }
      rafId = requestAnimationFrame(drain);
    }
    rafId = requestAnimationFrame(drain);
    return () => cancelAnimationFrame(rafId);
  }, [isActive]);

  const text = isActive ? (displayed || "……") : source;
  const isComplete = !isActive;
  const isThinking = isActive && displayed.length === 0;

  return { text, isComplete, isThinking };
}

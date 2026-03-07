"use client";

import { useEffect, useRef, useState } from "react";

const CHARS_PER_FRAME = 2;

/**
 * Grok-style stream: Delta append via queue + requestAnimationFrame.
 * Only appends new chars; displayed never shrinks. Latch: once displayed > 0, isThinking stays false.
 */
export function useSmoothStream(source: string, isActive: boolean): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const [hasShownContent, setHasShownContent] = useState(false);
  const queueRef = useRef("");
  const prevSourceLenRef = useRef(0);
  const prevActiveRef = useRef(isActive);

  /* eslint-disable react-hooks/set-state-in-effect -- reset on stream start/end */
  useEffect(() => {
    const streamJustStarted = isActive && !prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (!isActive) {
      setDisplayed(source);
      setHasShownContent(false);
      queueRef.current = "";
      prevSourceLenRef.current = source.length;
      return;
    }
    if (streamJustStarted) {
      setHasShownContent(false);
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

  /* eslint-disable react-hooks/set-state-in-effect -- latch */
  useEffect(() => {
    if (displayed.length > 0) setHasShownContent(true);
  }, [displayed]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const text = isActive ? (displayed || "……") : source;
  const isComplete = !isActive;
  const isThinking = isActive && displayed.length === 0 && !hasShownContent;

  return { text, isComplete, isThinking };
}

"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";

const CHARS_PER_FRAME = 2;

/**
 * Architecture: decouple network ingestion from React. Incoming tokens append to
 * useRef buffer; rAF loop batches updates into single DOM write per frame (60 FPS).
 * Avoids re-render cascade from per-chunk setState.
 */
export function useSmoothStreamFromRef(
  narrativeRef: MutableRefObject<string>,
  isActive: boolean,
  onFrameScroll?: () => void
): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const queueRef = useRef("");
  const prevLenRef = useRef(0);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    if (!isActive) {
      setDisplayed("");
      queueRef.current = "";
      prevLenRef.current = 0;
      prevActiveRef.current = false;
      return;
    }
    prevActiveRef.current = true;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    let rafId: number;

    function tick() {
      const src = narrativeRef.current;
      if (src.length > prevLenRef.current) {
        const delta = src.slice(prevLenRef.current);
        queueRef.current += delta;
        prevLenRef.current = src.length;
      }

      const q = queueRef.current;
      if (q.length > 0) {
        const take = Math.min(CHARS_PER_FRAME, q.length);
        const chunk = q.slice(0, take);
        queueRef.current = q.slice(take);
        setDisplayed((prev) => prev + chunk);
        onFrameScroll?.();
      }

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, narrativeRef, onFrameScroll]);

  const text = isActive ? (displayed || "……") : "";
  const isComplete = !isActive;
  const isThinking = isActive && displayed.length === 0;

  return { text, isComplete, isThinking };
}

/**
 * Legacy: state-based source. Prefer useSmoothStreamFromRef for streaming.
 */
export function useSmoothStream(source: string, isActive: boolean): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const queueRef = useRef("");
  const prevSourceLenRef = useRef(0);
  const prevActiveRef = useRef(isActive);

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

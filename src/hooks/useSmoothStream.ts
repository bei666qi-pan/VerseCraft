"use client";

import { useEffect, useRef, useState } from "react";

const DRAIN_INTERVAL_MS = 20;
const CATCHUP_THRESHOLD = 30;
const CATCHUP_CHARS = 4;
const NORMAL_CHARS = 1;

/**
 * Anti-jitter smooth stream: displayed only ever increases.
 * Dynamic typing: when target - displayed > 30, add 4 chars/tick to catch up;
 * otherwise add 1 char for smooth typing.
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
        const gap = target.length - prev.length;
        const take = gap > CATCHUP_THRESHOLD ? Math.min(CATCHUP_CHARS, gap) : Math.min(NORMAL_CHARS, gap);
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

"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";

type SmoothStreamOptions = {
  minTickMs?: number;
  maxTickMs?: number;
  burstCharsWhenBacklog?: number;
};

const DEFAULT_OPTIONS: Required<SmoothStreamOptions> = {
  minTickMs: 24,
  maxTickMs: 140,
  burstCharsWhenBacklog: 26,
};

const CLAUSE_PUNCT = new Set([",", "，", "、", "：", "；", "…"]);
const SENTENCE_PUNCT = new Set(["。", "！", "？", "!", "?", "\n"]);

function isAsciiWordChar(ch: string): boolean {
  return /[a-zA-Z0-9]/.test(ch);
}

function takeSemanticChunk(input: string, maxLen = 18): string {
  if (!input) return "";
  if (input.length <= 2) return input;

  const limit = Math.min(maxLen, input.length);
  let i = 0;
  while (i < limit) {
    const ch = input[i] ?? "";
    if (!ch) break;
    if (SENTENCE_PUNCT.has(ch)) {
      i += 1;
      break;
    }
    if (CLAUSE_PUNCT.has(ch)) {
      i += 1;
      break;
    }
    if (ch === " ") {
      i += 1;
      break;
    }
    if (isAsciiWordChar(ch)) {
      let j = i + 1;
      while (j < limit && isAsciiWordChar(input[j] ?? "")) j += 1;
      i = j;
      if (j < input.length && (input[j] === " " || CLAUSE_PUNCT.has(input[j] ?? "") || SENTENCE_PUNCT.has(input[j] ?? ""))) {
        i += 1;
      }
      break;
    }
    i += 1;
    if (i >= 4 && (CLAUSE_PUNCT.has(input[i - 1] ?? "") || SENTENCE_PUNCT.has(input[i - 1] ?? ""))) {
      break;
    }
  }

  return input.slice(0, Math.max(1, i));
}

function computePauseMs(chunk: string, backlog: number, options: Required<SmoothStreamOptions>): number {
  const tail = chunk.trimEnd().slice(-1);
  let pause = options.maxTickMs;
  if (tail && SENTENCE_PUNCT.has(tail)) {
    pause = 150;
  } else if (tail && CLAUSE_PUNCT.has(tail)) {
    pause = 90;
  } else {
    pause = 52;
  }

  if (backlog > 320) pause = 20;
  else if (backlog > 200) pause = 28;
  else if (backlog > 120) pause = 36;
  else if (backlog > 60) pause = Math.min(pause, 44);

  return Math.max(options.minTickMs, Math.min(options.maxTickMs, pause));
}

/**
 * Architecture: decouple network ingestion from React. Incoming tokens append to
 * useRef buffer; rAF loop batches updates into single DOM write per frame (60 FPS).
 * Avoids re-render cascade from per-chunk setState.
 *
 * @param isStreamVisualActive When true, the typewriter drain runs and UI may show the in-flight narrative strip.
 *                             This is only the *display* path — not fetch status and not “interaction locked”.
 */
export function useSmoothStreamFromRef(
  narrativeRef: MutableRefObject<string>,
  isStreamVisualActive: boolean,
  onChunkRendered?: () => void,
  options?: SmoothStreamOptions
): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const queueRef = useRef("");
  const prevLenRef = useRef(0);
  const lastEmitAtRef = useRef(0);
  useEffect(() => {
    if (!isStreamVisualActive) {
      queueRef.current = "";
      prevLenRef.current = 0;
      lastEmitAtRef.current = 0;
      return;
    }
  }, [isStreamVisualActive]);

  useEffect(() => {
    if (!isStreamVisualActive) return;
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
        const mergedOptions: Required<SmoothStreamOptions> = {
          ...DEFAULT_OPTIONS,
          ...options,
        };
        const now = performance.now();
        const elapsed = now - lastEmitAtRef.current;
        if (lastEmitAtRef.current === 0 || elapsed >= mergedOptions.minTickMs) {
          let chunk = takeSemanticChunk(q);
          if (q.length > 180) {
            const burstLen = Math.min(mergedOptions.burstCharsWhenBacklog, q.length);
            chunk = q.slice(0, Math.max(chunk.length, burstLen));
          }
          const remain = q.slice(chunk.length);
          queueRef.current = remain;
          setDisplayed((prev) => prev + chunk);
          lastEmitAtRef.current = now;
          onChunkRendered?.();
          const pause = computePauseMs(chunk, remain.length, mergedOptions);
          lastEmitAtRef.current = now - mergedOptions.minTickMs + pause;
        }
      }

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isStreamVisualActive, narrativeRef, onChunkRendered, options]);

  const text = isStreamVisualActive ? displayed : "";
  const isComplete = !isStreamVisualActive;
  const isThinking = isStreamVisualActive && displayed.length === 0;

  return { text, isComplete, isThinking };
}

/**
 * Legacy: state-based source. Prefer useSmoothStreamFromRef for streaming.
 */
export function useSmoothStream(source: string, isStreamVisualActive: boolean): { text: string; isComplete: boolean; isThinking: boolean } {
  const text = source;
  const isComplete = !isStreamVisualActive;
  const isThinking = isStreamVisualActive && source.length === 0;

  return { text, isComplete, isThinking };
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";

type SmoothStreamOptions = {
  minTickMs?: number;
  maxTickMs?: number;
  /**
   * Four-stage speed strategy (Gemini-like):
   * - initial burst: first tokens appear fast
   * - steady flow: punctuation-aware normal typing
   * - backlog catch-up: when queue piles up, emit bigger chunks + reduce pauses
   * - punctuation pause: comma/period/question pause longer
   */
  initialBurstWindowMs?: number;
  initialBurstMaxLen?: number;
  steadyMaxLen?: number;
  backlogThreshold?: number;
  backlogMaxLen?: number;
  burstCharsWhenBacklog?: number; // backward compat with previous name
};

const DEFAULT_OPTIONS: Required<SmoothStreamOptions> = {
  minTickMs: 24,
  maxTickMs: 140,
  initialBurstWindowMs: 260,
  initialBurstMaxLen: 40,
  steadyMaxLen: 18,
  backlogThreshold: 220,
  backlogMaxLen: 36,
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
      // Keep consecutive newlines together to reduce layout jitter.
      if (ch === "\n") {
        i += 1;
        while (i < limit && input[i] === "\n") i += 1;
        break;
      }
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

function computePauseMs(args: {
  chunk: string;
  backlog: number;
  stage: "initial" | "steady" | "backlog";
  options: Required<SmoothStreamOptions>;
}): number {
  const { chunk, backlog, stage, options } = args;
  const tail = chunk.trimEnd().slice(-1);
  let pause: number;
  // punctuation pause
  if (tail && SENTENCE_PUNCT.has(tail)) pause = 150;
  else if (tail && CLAUSE_PUNCT.has(tail)) pause = 90;
  else pause = 52;

  // backlog catch-up reduces pauses
  if (stage === "backlog") {
    if (backlog > 420) pause = 24;
    else if (backlog > 300) pause = 30;
    else pause = Math.max(options.minTickMs, Math.min(pause, 58));
  }

  // initial burst keeps the first tokens snappy
  if (stage === "initial") {
    pause = Math.min(pause, 36);
  }

  return Math.max(options.minTickMs, Math.min(options.maxTickMs, pause));
}

function adjustChunkBoundaryForMarkers(chunk: string): string {
  // Avoid splitting markdown-ish/marker delimiters so plainOnly render doesn't show partial symbols.
  // - **...** uses "**" delimiter
  // - ^^...^^ uses "^^" delimiter
  let i = chunk.length - 1;
  let starCount = 0;
  while (i >= 0 && chunk[i] === "*") {
    starCount += 1;
    i -= 1;
  }
  // Keep trailing "*" count even to avoid leaving a partial "**" delimiter.
  if (starCount > 0 && starCount % 2 === 1 && chunk.length > 1) {
    return chunk.slice(0, -1);
  }

  i = chunk.length - 1;
  let caretCount = 0;
  while (i >= 0 && chunk[i] === "^") {
    caretCount += 1;
    i -= 1;
  }
  // Keep trailing "^" count even to avoid leaving a partial "^^" delimiter.
  if (caretCount > 0 && caretCount % 2 === 1 && chunk.length > 1) {
    return chunk.slice(0, -1);
  }
  return chunk;
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
  const emittedNonWsLenRef = useRef(0);
  const turnStartAtRef = useRef(0);
  const hasShownMeaningfulRef = useRef(false);

  const mergedOptionsRef = useRef<Required<SmoothStreamOptions>>({
    ...DEFAULT_OPTIONS,
    ...(options ?? {}),
  });

  useLayoutEffect(() => {
    mergedOptionsRef.current = {
      ...DEFAULT_OPTIONS,
      ...(options ?? {}),
    };
  }, [options]);

  useLayoutEffect(() => {
    // Reset for each new visual turn, so StreamPanel never shows stale text.
    if (isStreamVisualActive) {
      turnStartAtRef.current = performance.now();
      emittedNonWsLenRef.current = 0;
      hasShownMeaningfulRef.current = false;
      queueRef.current = "";
      prevLenRef.current = 0;
      lastEmitAtRef.current = 0;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed("");
    } else {
      queueRef.current = "";
      prevLenRef.current = 0;
      lastEmitAtRef.current = 0;
      emittedNonWsLenRef.current = 0;
      hasShownMeaningfulRef.current = false;
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
        const mergedOptions = mergedOptionsRef.current;
        // Determine 4-stage speed strategy.
        const now = performance.now();
        const backlog = q.length;
        const elapsedTurnMs = now - turnStartAtRef.current;

        const isInitial = elapsedTurnMs < mergedOptions.initialBurstWindowMs && !hasShownMeaningfulRef.current;
        const isBacklog = backlog > Math.max(mergedOptions.backlogThreshold, 120);

        const stage: "initial" | "steady" | "backlog" = isBacklog ? "backlog" : isInitial ? "initial" : "steady";

        // Spinner back-flash defense: do not emit-only-whitespace until first meaningful char.
        if (!hasShownMeaningfulRef.current) {
          const trimmed = q.replace(/^\s+/, "");
          if (trimmed !== q) {
            queueRef.current = trimmed;
            rafId = requestAnimationFrame(tick);
            return;
          }
        }

        const minGateMs = mergedOptions.minTickMs;
        const elapsedGate = now - lastEmitAtRef.current;
        if (lastEmitAtRef.current === 0 || elapsedGate >= minGateMs) {
          const maxLen =
            stage === "initial"
              ? mergedOptions.initialBurstMaxLen
              : stage === "backlog"
                ? (() => {
                    const over = Math.max(0, backlog - mergedOptions.backlogThreshold);
                    const t = Math.max(0, Math.min(1, over / 240));
                    const target =
                      mergedOptions.steadyMaxLen +
                      Math.round(t * (mergedOptions.backlogMaxLen - mergedOptions.steadyMaxLen));
                    return Math.min(target, mergedOptions.backlogMaxLen, backlog);
                  })()
                : mergedOptions.steadyMaxLen;

          let chunk = takeSemanticChunk(q, maxLen);
          chunk = adjustChunkBoundaryForMarkers(chunk);
          if (!chunk) {
            queueRef.current = q.slice(1);
          } else {
            const remain = q.slice(chunk.length);
            queueRef.current = remain;
            const nonWsAdd = chunk.replace(/\s/g, "").length;
            if (nonWsAdd > 0) {
              emittedNonWsLenRef.current += nonWsAdd;
              hasShownMeaningfulRef.current = true;
            }
            setDisplayed((prev) => prev + chunk);
            onChunkRendered?.();
            const pause = computePauseMs({ chunk, backlog: remain.length, stage, options: mergedOptions });
            // Gate next emission by pause (works even when pause < minTickMs).
            lastEmitAtRef.current = now - minGateMs + pause;
          }
        }
      }

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isStreamVisualActive, narrativeRef, onChunkRendered]);

  const text = isStreamVisualActive ? displayed : "";
  const isComplete = !isStreamVisualActive;
  // Show spinner only while there's no meaningful text on screen.
  const isThinking = isStreamVisualActive && displayed.replace(/\s/g, "").length === 0;

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

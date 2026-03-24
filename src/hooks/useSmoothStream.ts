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
  /** 匀速按码位吐出（忽略标点停顿与突发加速），适合叙事全程统一节奏 */
  uniformPacing?: boolean;
  /** 匀速模式下每吐出一个码位的间隔（毫秒） */
  uniformTickMs?: number;
};

export type SmoothStreamTailDrainConfig = {
  targetRef: MutableRefObject<string | null>;
  /** Increment when entering `tail_draining` so the hook can realign queue vs final narrative. */
  alignKey: number;
  onReached: () => void;
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
  uniformPacing: false,
  uniformTickMs: 40,
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
  streamOptions?: SmoothStreamOptions,
  tailDrain?: SmoothStreamTailDrainConfig | null
): { text: string; isComplete: boolean; isThinking: boolean } {
  const [displayed, setDisplayed] = useState("");
  const displayedRef = useRef("");
  const queueRef = useRef("");
  const prevLenRef = useRef(0);
  const lastEmitAtRef = useRef(0);
  const emittedNonWsLenRef = useRef(0);
  const turnStartAtRef = useRef(0);
  const hasShownMeaningfulRef = useRef(false);
  const tailDrainFiredRef = useRef(false);
  const onReachedRef = useRef<(() => void) | null>(null);

  const mergedOptionsRef = useRef<Required<SmoothStreamOptions>>({
    ...DEFAULT_OPTIONS,
    ...(streamOptions ?? {}),
  });

  useLayoutEffect(() => {
    mergedOptionsRef.current = {
      ...DEFAULT_OPTIONS,
      ...(streamOptions ?? {}),
    };
  }, [streamOptions]);

  useLayoutEffect(() => {
    onReachedRef.current = tailDrain?.onReached ?? null;
  }, [tailDrain]);

  useLayoutEffect(() => {
    // Reset for each new visual turn, so StreamPanel never shows stale text.
    if (isStreamVisualActive) {
      turnStartAtRef.current = performance.now();
      emittedNonWsLenRef.current = 0;
      hasShownMeaningfulRef.current = false;
      queueRef.current = "";
      prevLenRef.current = 0;
      lastEmitAtRef.current = 0;
      tailDrainFiredRef.current = false;
      displayedRef.current = "";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed("");
    } else {
      queueRef.current = "";
      prevLenRef.current = 0;
      lastEmitAtRef.current = 0;
      emittedNonWsLenRef.current = 0;
      hasShownMeaningfulRef.current = false;
      tailDrainFiredRef.current = false;
      displayedRef.current = "";
    }
  }, [isStreamVisualActive]);

  useLayoutEffect(() => {
    if (!isStreamVisualActive || !tailDrain || tailDrain.alignKey <= 0) return;
    const T = tailDrain.targetRef.current;
    if (!T) return;
    if (narrativeRef.current !== T) {
      narrativeRef.current = T;
    }
    const d = displayedRef.current;
    if (T.startsWith(d)) {
      queueRef.current = T.slice(d.length);
      prevLenRef.current = T.length;
    } else {
      queueRef.current = T;
      prevLenRef.current = T.length;
      displayedRef.current = "";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayed("");
    }
    tailDrainFiredRef.current = false;
  }, [isStreamVisualActive, tailDrain, narrativeRef]);

  useEffect(() => {
    if (!isStreamVisualActive) return;
    let rafId: number;

    function tick() {
      const mergedOptions = mergedOptionsRef.current;
      const src = narrativeRef.current;
      if (src.length > prevLenRef.current) {
        const delta = src.slice(prevLenRef.current);
        queueRef.current += delta;
        prevLenRef.current = src.length;
      }

      let q = queueRef.current;

      if (mergedOptions.uniformPacing) {
        const now = performance.now();
        const tickMs = Math.max(12, mergedOptions.uniformTickMs);
        if (q.length > 0) {
          if (!hasShownMeaningfulRef.current) {
            const trimmed = q.replace(/^\s+/, "");
            if (trimmed !== q) {
              queueRef.current = trimmed;
            } else if (lastEmitAtRef.current === 0 || now - lastEmitAtRef.current >= tickMs) {
              const head = trimmed[0] ?? "";
              let len = 1;
              const c0 = head.charCodeAt(0);
              if (c0 >= 0xd800 && c0 <= 0xdbff && trimmed.length > 1) {
                len = 2;
              }
              const chunk = trimmed.slice(0, len);
              queueRef.current = trimmed.slice(len);
              const nonWsAdd = chunk.replace(/\s/g, "").length;
              if (nonWsAdd > 0) {
                emittedNonWsLenRef.current += nonWsAdd;
                hasShownMeaningfulRef.current = true;
              }
              displayedRef.current = displayedRef.current + chunk;
              setDisplayed((prev) => prev + chunk);
              onChunkRendered?.();
              lastEmitAtRef.current = now;
            }
          } else if (lastEmitAtRef.current === 0 || now - lastEmitAtRef.current >= tickMs) {
            const head = q[0] ?? "";
            let len = 1;
            const c0 = head.charCodeAt(0);
            if (c0 >= 0xd800 && c0 <= 0xdbff && q.length > 1) {
              len = 2;
            }
            const chunk = q.slice(0, len);
            queueRef.current = q.slice(len);
            const nonWsAdd = chunk.replace(/\s/g, "").length;
            if (nonWsAdd > 0) {
              emittedNonWsLenRef.current += nonWsAdd;
              hasShownMeaningfulRef.current = true;
            }
            displayedRef.current = displayedRef.current + chunk;
            setDisplayed((prev) => prev + chunk);
            onChunkRendered?.();
            lastEmitAtRef.current = now;
          }
        }
      } else {
        q = queueRef.current;
        if (q.length > 0) {
          const now = performance.now();
          const backlog = q.length;
          const elapsedTurnMs = now - turnStartAtRef.current;

          const isInitial = elapsedTurnMs < mergedOptions.initialBurstWindowMs && !hasShownMeaningfulRef.current;
          const isBacklog = backlog > Math.max(mergedOptions.backlogThreshold, 120);

          const stage: "initial" | "steady" | "backlog" = isBacklog ? "backlog" : isInitial ? "initial" : "steady";

          if (!hasShownMeaningfulRef.current) {
            const trimmed = q.replace(/^\s+/, "");
            if (trimmed !== q) {
              queueRef.current = trimmed;
            }
          }

          q = queueRef.current;
          const minGateMs = mergedOptions.minTickMs;
          const elapsedGate = now - lastEmitAtRef.current;
          if (q.length > 0 && (lastEmitAtRef.current === 0 || elapsedGate >= minGateMs)) {
            const maxLen =
              stage === "initial"
                ? mergedOptions.initialBurstMaxLen
                : stage === "backlog"
                  ? (() => {
                      const over = Math.max(0, q.length - mergedOptions.backlogThreshold);
                      const t = Math.max(0, Math.min(1, over / 240));
                      const target =
                        mergedOptions.steadyMaxLen +
                        Math.round(t * (mergedOptions.backlogMaxLen - mergedOptions.steadyMaxLen));
                      return Math.min(target, mergedOptions.backlogMaxLen, q.length);
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
              displayedRef.current = displayedRef.current + chunk;
              setDisplayed((prev) => prev + chunk);
              onChunkRendered?.();
              const pause = computePauseMs({ chunk, backlog: remain.length, stage, options: mergedOptions });
              lastEmitAtRef.current = now - minGateMs + pause;
            }
          }
        }
      }

      const target = tailDrain?.targetRef.current ?? null;
      if (!target) {
        tailDrainFiredRef.current = false;
      } else if (
        narrativeRef.current === target &&
        queueRef.current.length === 0 &&
        displayedRef.current === target &&
        prevLenRef.current === target.length
      ) {
        if (!tailDrainFiredRef.current) {
          tailDrainFiredRef.current = true;
          queueMicrotask(() => {
            onReachedRef.current?.();
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isStreamVisualActive, narrativeRef, onChunkRendered, tailDrain]);

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

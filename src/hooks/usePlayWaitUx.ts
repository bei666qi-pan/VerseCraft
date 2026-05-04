"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import type { PlaySemanticWaitingKind } from "@/features/play/components/PlaySemanticWaitingHint";
import { playWaitUxSemanticSubline, primaryLineForWaitStage } from "@/features/play/waitUx/waitUxCopy";
import type { PlayWaitUxStage } from "@/features/play/waitUx/waitUxStages";
import {
  advanceWaitUxDisplay,
  initialWaitUxDisplay,
  type WaitUxDisplayState,
} from "@/features/play/waitUx/waitUxTimeline";
import { VC_WAITING } from "@/lib/perf/waitingConfig";

const TICK_MS = VC_WAITING.playWaitUxTickMs;

function isPlayWaitUxEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_WAITING_UX !== "0";
}

function longWaitSubline(args: {
  elapsedMs: number;
  hasResponseHeaders: boolean;
  hasAnySseData: boolean;
  hasVisibleText: boolean;
}): string | null {
  if (args.hasVisibleText) return null;
  if (args.elapsedMs >= VC_WAITING.playWaitUxVeryLongFeedbackAfterMs) {
    if (args.hasAnySseData) return "正文已经抵达，正在继续铺开；不用重复提交。";
    if (args.hasResponseHeaders) return "本回合仍在生成，连接保持中；不用重复提交。";
    return "请求仍在路上，页面没有卡死；不用重复提交。";
  }
  if (args.elapsedMs >= VC_WAITING.playWaitUxLongFeedbackAfterMs) {
    if (args.hasAnySseData) return "正文已经抵达，正在铺开。";
    if (args.hasResponseHeaders) return "正文仍在生成，页面没有卡死。";
    return "仍在接通叙事通道，页面没有卡死。";
  }
  return null;
}

export function usePlayWaitUx(args: {
  /** 首字前为 true：与 StreamPanel 的 smoothThinking 对齐 */
  thinking: boolean;
  /** 本轮请求开始时间（performance.now），无则关闭 */
  requestStartedAt: number | null;
  /** 由 SSE 控制帧更新的最新后端阶段 */
  backendStageRef: MutableRefObject<PlayWaitUxStage | null>;
  semanticKind: PlaySemanticWaitingKind | null;
  /**
   * 前端信号（不改变后端契约）：
   * - 后端有 stage 时优先相信后端
   * - 后端沉默时用这些信号让等待推进更可信且不闪烁
   */
  signals?: {
    hasResponseHeaders?: boolean;
    hasAnySseData?: boolean;
    hasVisibleText?: boolean;
  };
}): { primaryLine: string; secondaryLine: string | null; displayStage: PlayWaitUxStage } {
  const [display, setDisplay] = useState<WaitUxDisplayState>(() => ({
    stage: "request_sent",
    lastStageChangeAt: 0,
  }));
  const [elapsedMs, setElapsedMs] = useState(0);
  const displayRef = useRef(display);

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  const enabled = isPlayWaitUxEnabled() && args.thinking && args.requestStartedAt !== null;
  const hasClientSignals = args.signals !== undefined;
  const signalHasResponseHeaders = Boolean(args.signals?.hasResponseHeaders);
  const signalHasAnySseData = Boolean(args.signals?.hasAnySseData);
  const signalHasVisibleText = Boolean(args.signals?.hasVisibleText);

  useLayoutEffect(() => {
    if (!enabled || args.requestStartedAt === null) return;
    const now = performance.now();
    const init = initialWaitUxDisplay(now);
    displayRef.current = init;
    setDisplay(init);
    setElapsedMs(now - args.requestStartedAt);
  }, [enabled, args.requestStartedAt]);

  useEffect(() => {
    if (!enabled || args.requestStartedAt === null) return;

    const id = window.setInterval(() => {
      const now = performance.now();
      setElapsedMs(now - args.requestStartedAt!);
      const next = advanceWaitUxDisplay({
        now,
        requestStartedAt: args.requestStartedAt!,
        backend: args.backendStageRef.current,
        prev: displayRef.current,
        signals: hasClientSignals
          ? {
              hasResponseHeaders: signalHasResponseHeaders,
              hasAnySseData: signalHasAnySseData,
              hasVisibleText: signalHasVisibleText,
            }
          : undefined,
      });
      if (next.stage !== displayRef.current.stage || next.lastStageChangeAt !== displayRef.current.lastStageChangeAt) {
        displayRef.current = next;
        setDisplay(next);
      }
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [
    enabled,
    args.requestStartedAt,
    args.backendStageRef,
    hasClientSignals,
    signalHasResponseHeaders,
    signalHasAnySseData,
    signalHasVisibleText,
  ]);

  if (!enabled || args.requestStartedAt === null) {
    return { primaryLine: "", secondaryLine: null, displayStage: "idle" };
  }

  const primaryLine = primaryLineForWaitStage(display.stage);
  const longSubline = longWaitSubline({
    elapsedMs,
    hasResponseHeaders: signalHasResponseHeaders,
    hasAnySseData: signalHasAnySseData,
    hasVisibleText: signalHasVisibleText,
  });
  const showSemanticSubline =
    elapsedMs >= VC_WAITING.playWaitUxSemanticSublineAfterMs &&
    (display.stage === "routing" ||
      display.stage === "context_building" ||
      display.stage === "generating" ||
      display.stage === "streaming");
  const semanticSubline = showSemanticSubline ? playWaitUxSemanticSubline(args.semanticKind) : null;
  const secondaryLine = longSubline ?? semanticSubline;

  return { primaryLine, secondaryLine, displayStage: display.stage };
}

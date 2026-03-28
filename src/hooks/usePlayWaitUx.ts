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

const TICK_MS = 160;

function isPlayWaitUxEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_WAITING_UX !== "0";
}

export function usePlayWaitUx(args: {
  /** 首字前为 true：与 StreamPanel 的 smoothThinking 对齐 */
  thinking: boolean;
  /** 本轮请求开始时间（performance.now），无则关闭 */
  requestStartedAt: number | null;
  /** 由 SSE 控制帧更新的最新后端阶段 */
  backendStageRef: MutableRefObject<PlayWaitUxStage | null>;
  semanticKind: PlaySemanticWaitingKind | null;
}): { primaryLine: string; secondaryLine: string | null; displayStage: PlayWaitUxStage } {
  const [display, setDisplay] = useState<WaitUxDisplayState>(() => ({
    stage: "request_sent",
    lastStageChangeAt: 0,
  }));
  const displayRef = useRef(display);
  displayRef.current = display;

  const enabled = isPlayWaitUxEnabled() && args.thinking && args.requestStartedAt !== null;

  useLayoutEffect(() => {
    if (!enabled || args.requestStartedAt === null) return;
    const init = initialWaitUxDisplay(performance.now());
    displayRef.current = init;
    setDisplay(init);
  }, [enabled, args.requestStartedAt]);

  useEffect(() => {
    if (!enabled || args.requestStartedAt === null) return;

    const id = window.setInterval(() => {
      const now = performance.now();
      const next = advanceWaitUxDisplay({
        now,
        requestStartedAt: args.requestStartedAt!,
        backend: args.backendStageRef.current,
        prev: displayRef.current,
      });
      if (next.stage !== displayRef.current.stage || next.lastStageChangeAt !== displayRef.current.lastStageChangeAt) {
        displayRef.current = next;
        setDisplay(next);
      }
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [enabled, args.requestStartedAt, args.backendStageRef]);

  if (!enabled || args.requestStartedAt === null) {
    return { primaryLine: "", secondaryLine: null, displayStage: "idle" };
  }

  const primaryLine = primaryLineForWaitStage(display.stage);
  const elapsed = performance.now() - args.requestStartedAt;
  const showSub =
    elapsed >= 2200 &&
    (display.stage === "context_building" ||
      display.stage === "generating" ||
      display.stage === "streaming");
  const secondaryLine = showSub ? playWaitUxSemanticSubline(args.semanticKind) : null;

  return { primaryLine, secondaryLine, displayStage: display.stage };
}

"use client";

import { startTransition, useCallback } from "react";
import type { CorrectionPayload } from "@/lib/security/auditProtocol";
import { useRollbackStore, type RollbackEvent } from "@/store/useRollbackStore";

export function useRollbackController(
  replayReducer?: (event: RollbackEvent, options: { offline: true }) => void
) {
  const captureFrameSnapshot = useRollbackStore((s) => s.captureFrameSnapshot);
  const recordInputEvent = useRollbackStore((s) => s.recordInputEvent);
  const markEventAccepted = useRollbackStore((s) => s.markEventAccepted);
  const rollbackToTarget = useRollbackStore((s) => s.rollbackToTarget);
  const isReplaying = useRollbackStore((s) => s.isReplaying);

  const applyCorrectionPayload = useCallback(
    (payload: CorrectionPayload) => {
      startTransition(() => {
        rollbackToTarget(payload, replayReducer);
      });
    },
    [rollbackToTarget, replayReducer]
  );

  return {
    isReplaying,
    captureFrameSnapshot,
    recordInputEvent,
    markEventAccepted,
    applyCorrectionPayload,
  };
}


"use client";

import { create } from "zustand";
import { useGameStore } from "@/store/useGameStore";
import type { AuditInputEvent, CorrectionPayload } from "@/lib/security/auditProtocol";
import { MAX_ROLLBACK_HISTORY } from "@/lib/security/auditProtocol";

export type RollbackSnapshot = {
  timestamp: number;
  state: Record<string, unknown>;
};

export type RollbackEvent = AuditInputEvent & {
  accepted?: boolean;
};

function deepClone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function sanitizeDataState(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDataState(v));
  }
  if (typeof value !== "object") return undefined;

  const out: Record<string, unknown> = {};
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === "function") continue;
    if (key.startsWith("_")) continue;
    out[key] = sanitizeDataState(obj[key]);
  }
  return out;
}

function pickGameDataState(): Record<string, unknown> {
  const raw = useGameStore.getState();
  return deepClone((sanitizeDataState(raw) ?? {}) as Record<string, unknown>);
}

function applyGameDataState(snapshot: Record<string, unknown>) {
  useGameStore.setState(snapshot as Partial<ReturnType<typeof useGameStore.getState>>);
}

type RollbackStoreState = {
  historyStateBuffer: RollbackSnapshot[];
  inputEventBuffer: RollbackEvent[];
  isReplaying: boolean;
  captureFrameSnapshot: (timestamp?: number) => void;
  recordInputEvent: (event: RollbackEvent) => void;
  markEventAccepted: (eventId: string, accepted: boolean) => void;
  rollbackToTarget: (
    correction: CorrectionPayload,
    replayReducer?: (event: RollbackEvent, options: { offline: true }) => void
  ) => void;
  clearRollbackBuffers: () => void;
};

export const useRollbackStore = create<RollbackStoreState>()((set, get) => ({
  historyStateBuffer: [],
  inputEventBuffer: [],
  isReplaying: false,

  captureFrameSnapshot: (timestamp = Date.now()) =>
    set((state) => {
      const snap: RollbackSnapshot = {
        timestamp,
        state: pickGameDataState(),
      };
      const next = [snap, ...state.historyStateBuffer].slice(0, MAX_ROLLBACK_HISTORY);
      return { historyStateBuffer: next };
    }),

  recordInputEvent: (event) =>
    set((state) => {
      const next = [event, ...state.inputEventBuffer].slice(0, MAX_ROLLBACK_HISTORY);
      return { inputEventBuffer: next };
    }),

  markEventAccepted: (eventId, accepted) =>
    set((state) => ({
      inputEventBuffer: state.inputEventBuffer.map((evt) =>
        evt.id === eventId ? { ...evt, accepted } : evt
      ),
    })),

  rollbackToTarget: (correction, replayReducer) => {
    const state = get();
    if (!correction.shouldRollback) return;

    set({ isReplaying: true });
    try {
      const sortedHistory = [...state.historyStateBuffer].sort((a, b) => b.timestamp - a.timestamp);
      const target =
        sortedHistory.find((s) => s.timestamp <= correction.lastLegalTimestamp)?.state ??
        deepClone(correction.resetStateSnapshot);

      applyGameDataState(target);

      const replayEvents = [...state.inputEventBuffer]
        .filter((evt) => evt.timestamp > correction.lastLegalTimestamp && evt.accepted !== false)
        .sort((a, b) => a.timestamp - b.timestamp);

      if (typeof replayReducer === "function") {
        for (const evt of replayEvents) {
          replayReducer(evt, { offline: true });
        }
      }

      const now = Date.now();
      get().captureFrameSnapshot(now);
      set((prev) => ({
        inputEventBuffer: prev.inputEventBuffer.filter((evt) => evt.timestamp >= correction.lastLegalTimestamp),
      }));
    } finally {
      set({ isReplaying: false });
    }
  },

  clearRollbackBuffers: () =>
    set({
      historyStateBuffer: [],
      inputEventBuffer: [],
      isReplaying: false,
    }),
}));


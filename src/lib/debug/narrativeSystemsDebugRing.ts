import type { EndingTelemetryEventName, EndingTelemetryPayload } from "@/lib/endings/telemetry";

/**
 * 阶段 7：叙事/变更集/手记/目标 可观测性（环形缓冲，仅开发或显式开启）。
 * 客户端设置 NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1 后，/play 回合 commit 会写入摘要。
 */

export type NarrativeTurnCommitDebugEvent = {
  kind: "turn_commit";
  at: number;
  changeSetApplied?: boolean;
  changeSetTrace: string[];
  /** 从 trace 解析的过滤/跳过原因（便于排错） */
  filteredHints: string[];
  clueUpdatesInTurn: number;
  newTasksInTurn: number;
  taskUpdatesInTurn: number;
  awardedItemsInTurn: number;
  awardedWarehouseInTurn: number;
  journalClueTotal: number;
  taskTotal: number;
  inventoryCount: number;
  warehouseCount: number;
};

export type EndingDecisionDebugEvent = {
  kind: "ending_decision";
  at: number;
  eventName: EndingTelemetryEventName;
  runId: string;
  outcome: string | null;
  endingPhase: string;
  detectedAtTurn: number | null;
  idempotencyKey: string | null;
  reasons: string[];
  blockers: string[];
  escapeStage: string;
  survivalHours: number;
  source: string;
  snapshotPresent: boolean;
  settlementId: string | null;
  note?: string;
};

export type NarrativeSystemsDebugEvent = NarrativeTurnCommitDebugEvent | EndingDecisionDebugEvent;

const MAX = 20;
const ring: NarrativeSystemsDebugEvent[] = [];

export function isNarrativeSystemsDebugEnabled(): boolean {
  try {
    if (typeof process !== "undefined" && process.env) {
      if (process.env.NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG === "1") return true;
      if (process.env.VERSECRAFT_SYSTEMS_DEBUG === "1") return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** 从 change_set_trace 等条目中提取人类可读的「被丢弃/跳过」提示 */
export function extractFilteredHintsFromTrace(trace: string[]): string[] {
  const out: string[] = [];
  const prefixes = [
    "objective_skip_unseen:",
    "objective_dup:",
    "objective_invalid_draft:",
    "obtained_reject:",
    "legacy_new_tasks_truncated:",
    "new_tasks_cap:",
    "schema_reject:",
  ];
  for (const line of trace) {
    if (typeof line !== "string") continue;
    if (prefixes.some((p) => line.startsWith(p))) out.push(line);
  }
  return out.slice(0, 24);
}

export function pushNarrativeSystemsDebugEvent(event: NarrativeSystemsDebugEvent): void {
  if (!isNarrativeSystemsDebugEnabled()) return;
  ring.unshift(event);
  while (ring.length > MAX) ring.pop();
}

export function pushEndingDecisionDebugEvent(input: {
  eventName: EndingTelemetryEventName;
  payload: EndingTelemetryPayload;
  note?: string;
  at?: number;
}): void {
  if (!isNarrativeSystemsDebugEnabled()) return;
  pushNarrativeSystemsDebugEvent({
    kind: "ending_decision",
    at: input.at ?? Date.now(),
    eventName: input.eventName,
    runId: input.payload.runId,
    outcome: input.payload.outcome,
    endingPhase: input.payload.endingPhase,
    detectedAtTurn: input.payload.detectedAtTurn,
    idempotencyKey: input.payload.idempotencyKey,
    reasons: input.payload.reasons,
    blockers: input.payload.blockers,
    escapeStage: input.payload.escapeStage,
    survivalHours: input.payload.survivalHours,
    source: input.payload.source,
    snapshotPresent: input.payload.snapshotPresent,
    settlementId: input.payload.settlementId,
    note: input.note,
  });
}

export function getNarrativeSystemsDebugTail(n = 8): NarrativeSystemsDebugEvent[] {
  return ring.slice(0, Math.max(0, Math.min(n, MAX)));
}

export function clearNarrativeSystemsDebugRing(): void {
  ring.length = 0;
}

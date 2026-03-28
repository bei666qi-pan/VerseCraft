/**
 * 阶段 7：叙事/变更集/手记/目标 可观测性（环形缓冲，仅开发或显式开启）。
 * 客户端设置 NEXT_PUBLIC_VERSECRAFT_SYSTEMS_DEBUG=1 后，/play 回合 commit 会写入摘要。
 */

export type NarrativeSystemsDebugEvent = {
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

const MAX = 12;
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

export function getNarrativeSystemsDebugTail(n = 8): NarrativeSystemsDebugEvent[] {
  return ring.slice(0, Math.max(0, Math.min(n, MAX)));
}

export function clearNarrativeSystemsDebugRing(): void {
  ring.length = 0;
}

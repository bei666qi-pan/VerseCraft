import { safeRate } from "@/lib/admin/metricsUtils";

export type ContentQualityCountRow = {
  eventName?: unknown;
  worldId?: unknown;
  chapterId?: unknown;
  npcId?: unknown;
  count?: unknown;
};

export type ContentQualityValidatorRow = {
  eventName?: unknown;
  issueCount?: unknown;
  byCode?: unknown;
  issueCodes?: unknown;
  issueCode?: unknown;
  code?: unknown;
};

export type ContentQualityFeedbackTopic = { topic?: string; count?: number };

export type BuildContentQualitySnapshotInput = {
  worldSelectionRows?: ContentQualityCountRow[];
  worldFirstActionRows?: ContentQualityCountRow[];
  chapterRows?: ContentQualityCountRow[];
  npcRows?: ContentQualityCountRow[];
  validatorRows?: ContentQualityValidatorRow[];
  retryRows?: ContentQualityCountRow[];
  feedbackTopics?: ContentQualityFeedbackTopic[];
  feedbackSampleSize?: number;
  negativeFeedbackCount?: number;
  surveySampleSize?: number;
};

export type ContentQualityMetricsSnapshot = {
  sampleSize: number;
  evidenceSufficiency: "enough" | "insufficient";
  worldSelections: Array<{ worldId: string; count: number; firstActionCount: number; firstActionRate: number }>;
  worldFirstActionRate: number;
  chapters: {
    entered: Array<{ worldId: string; chapterId: string; count: number }>;
    completed: Array<{ worldId: string; chapterId: string; count: number }>;
    abandoned: Array<{ worldId: string; chapterId: string; count: number }>;
    rank: Array<{
      worldId: string;
      chapterId: string;
      entered: number;
      completed: number;
      abandoned: number;
      completionRate: number;
      abandonRate: number;
    }>;
    completionRate: number;
    abandonRate: number;
    evidenceSufficiency: "enough" | "insufficient";
  };
  npcInteractions: {
    rank: Array<{
      npcId: string;
      started: number;
      completed: number;
      failed: number;
      completionRate: number;
      failureRate: number;
    }>;
    completionRate: number;
    failureRate: number;
  };
  validatorIssues: {
    total: number;
    byCode: Array<{ code: string; count: number }>;
  };
  retryRegenerationCount: number;
  retryRegeneration: {
    retryCount: number;
    regenCount: number;
    total: number;
  };
  feedbackTopics: ContentQualityFeedbackTopic[];
  feedbackSampleSize: number;
  negativeFeedbackRate: number;
  surveySampleSize: number;
};

function text(value: unknown, fallback = "unknown"): string {
  if (typeof value === "string") {
    const clean = value.trim();
    if (clean) return clean;
  }
  return fallback;
}

function n(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function key(worldId: string, chapterId: string): string {
  return `${worldId}\u0000${chapterId}`;
}

function add(map: Map<string, number>, keyName: string, count: number): void {
  map.set(keyName, (map.get(keyName) ?? 0) + count);
}

function sortedMap(map: Map<string, number>, limit: number): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([keyName, count]) => ({ key: keyName, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function countRows(rows: ContentQualityCountRow[] | undefined, eventName?: string): number {
  return (rows ?? []).reduce((sum, row) => {
    if (eventName && text(row.eventName, "") !== eventName) return sum;
    return sum + n(row.count);
  }, 0);
}

function aggregateValidatorIssues(rows: ContentQualityValidatorRow[] | undefined): { total: number; byCode: Array<{ code: string; count: number }> } {
  const byCode = new Map<string, number>();
  let total = 0;

  for (const row of rows ?? []) {
    const object = parseObject(row.byCode);
    if (object) {
      let rowTotal = 0;
      for (const [code, count] of Object.entries(object)) {
        const value = n(count);
        if (value <= 0) continue;
        add(byCode, code, value);
        rowTotal += value;
      }
      total += rowTotal;
      continue;
    }

    const issueCodes = parseArray(row.issueCodes).map((item) => text(item, "")).filter(Boolean);
    if (issueCodes.length > 0) {
      for (const code of issueCodes) add(byCode, code, 1);
      total += issueCodes.length;
      continue;
    }

    const code = text(row.issueCode ?? row.code, "");
    const count = n(row.issueCount) || 1;
    if (code) {
      add(byCode, code, count);
    } else {
      add(byCode, "unknown", count);
    }
    total += count;
  }

  return {
    total,
    byCode: sortedMap(byCode, 20).map((item) => ({ code: item.key, count: item.count })),
  };
}

export function buildContentQualityMetricsSnapshot(input: BuildContentQualitySnapshotInput): ContentQualityMetricsSnapshot {
  const worldFirstActionByWorld = new Map<string, number>();
  for (const row of input.worldFirstActionRows ?? []) {
    add(worldFirstActionByWorld, text(row.worldId), n(row.count));
  }

  const worldSelections = (input.worldSelectionRows ?? [])
    .map((row) => {
      const worldId = text(row.worldId);
      const count = n(row.count);
      const firstActionCount = worldFirstActionByWorld.get(worldId) ?? 0;
      return { worldId, count, firstActionCount, firstActionRate: safeRate(firstActionCount, count) };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.worldId.localeCompare(b.worldId))
    .slice(0, 10);

  const chapterEntered = new Map<string, number>();
  const chapterCompleted = new Map<string, number>();
  const chapterAbandoned = new Map<string, number>();
  const chapterIds = new Set<string>();
  for (const row of input.chapterRows ?? []) {
    const worldId = text(row.worldId);
    const chapterId = text(row.chapterId);
    const rowKey = key(worldId, chapterId);
    chapterIds.add(rowKey);
    const count = n(row.count);
    const eventName = text(row.eventName, "");
    if (eventName === "chapter_completed") add(chapterCompleted, rowKey, count);
    else if (eventName === "chapter_abandoned") add(chapterAbandoned, rowKey, count);
    else add(chapterEntered, rowKey, count);
  }

  const chapterRow = (rowKey: string, count: number) => {
    const [worldId = "unknown", chapterId = "unknown"] = rowKey.split("\u0000");
    return { worldId, chapterId, count };
  };
  const entered = sortedMap(chapterEntered, 20).map((item) => chapterRow(item.key, item.count));
  const completed = sortedMap(chapterCompleted, 20).map((item) => chapterRow(item.key, item.count));
  const abandoned = sortedMap(chapterAbandoned, 20).map((item) => chapterRow(item.key, item.count));
  const chapterRank = [...chapterIds]
    .map((rowKey) => {
      const [worldId = "unknown", chapterId = "unknown"] = rowKey.split("\u0000");
      const enteredCount = chapterEntered.get(rowKey) ?? 0;
      const completedCount = chapterCompleted.get(rowKey) ?? 0;
      const abandonedCount = chapterAbandoned.get(rowKey) ?? 0;
      return {
        worldId,
        chapterId,
        entered: enteredCount,
        completed: completedCount,
        abandoned: abandonedCount,
        completionRate: safeRate(completedCount, enteredCount),
        abandonRate: safeRate(abandonedCount, enteredCount),
      };
    })
    .sort((a, b) => b.entered - a.entered || a.chapterId.localeCompare(b.chapterId))
    .slice(0, 20);

  const npcById = new Map<string, { started: number; completed: number; failed: number }>();
  for (const row of input.npcRows ?? []) {
    const npcId = text(row.npcId);
    const item = npcById.get(npcId) ?? { started: 0, completed: 0, failed: 0 };
    const count = n(row.count);
    const eventName = text(row.eventName, "");
    if (eventName === "npc_interaction_completed") item.completed += count;
    else if (eventName === "npc_interaction_failed") item.failed += count;
    else item.started += count;
    npcById.set(npcId, item);
  }
  const npcRank = [...npcById.entries()]
    .map(([npcId, item]) => ({
      npcId,
      ...item,
      completionRate: safeRate(item.completed, item.started),
      failureRate: safeRate(item.failed, item.started),
    }))
    .sort((a, b) => b.started - a.started || b.completed - a.completed || a.npcId.localeCompare(b.npcId))
    .slice(0, 20);

  const validatorIssues = aggregateValidatorIssues(input.validatorRows);
  const retryCount = countRows(input.retryRows, "retry_clicked");
  const regenCount = countRows(input.retryRows, "regen_clicked");
  const retryRegenerationCount = retryCount + regenCount;
  const feedbackSampleSize = n(input.feedbackSampleSize);
  const negativeFeedbackCount = n(input.negativeFeedbackCount);
  const surveySampleSize = n(input.surveySampleSize);
  const totalWorldSelections = worldSelections.reduce((sum, row) => sum + row.count, 0);
  const totalWorldFirstActions = worldSelections.reduce((sum, row) => sum + row.firstActionCount, 0);
  const totalEntered = entered.reduce((sum, row) => sum + row.count, 0);
  const totalCompleted = completed.reduce((sum, row) => sum + row.count, 0);
  const totalAbandoned = abandoned.reduce((sum, row) => sum + row.count, 0);
  const totalNpcStarted = npcRank.reduce((sum, row) => sum + row.started, 0);
  const totalNpcCompleted = npcRank.reduce((sum, row) => sum + row.completed, 0);
  const totalNpcFailed = npcRank.reduce((sum, row) => sum + row.failed, 0);
  const sampleSize = Math.max(
    totalWorldSelections,
    totalWorldFirstActions,
    totalEntered,
    totalNpcStarted,
    validatorIssues.total,
    retryRegenerationCount,
    feedbackSampleSize,
    surveySampleSize
  );

  return {
    sampleSize,
    evidenceSufficiency: sampleSize >= 20 ? "enough" : "insufficient",
    worldSelections,
    worldFirstActionRate: safeRate(totalWorldFirstActions, totalWorldSelections),
    chapters: {
      entered,
      completed,
      abandoned,
      rank: chapterRank,
      completionRate: safeRate(totalCompleted, totalEntered),
      abandonRate: safeRate(totalAbandoned, totalEntered),
      evidenceSufficiency: totalEntered >= 20 ? "enough" : "insufficient",
    },
    npcInteractions: {
      rank: npcRank,
      completionRate: safeRate(totalNpcCompleted, totalNpcStarted),
      failureRate: safeRate(totalNpcFailed, totalNpcStarted),
    },
    validatorIssues,
    retryRegenerationCount,
    retryRegeneration: { retryCount, regenCount, total: retryRegenerationCount },
    feedbackTopics: (input.feedbackTopics ?? []).slice(0, 10),
    feedbackSampleSize,
    negativeFeedbackRate: safeRate(negativeFeedbackCount, feedbackSampleSize),
    surveySampleSize,
  };
}

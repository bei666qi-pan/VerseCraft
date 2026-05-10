import type { ChapterDefinition, ChapterId } from "./types";

export const CHAPTER_ONE_ID = "chapter-1" as const;
export const CHAPTER_TWO_ID = "chapter-2" as const;

const SEED_CHAPTER_DEFINITIONS: readonly ChapterDefinition[] = [
  {
    id: CHAPTER_ONE_ID,
    order: 1,
    title: "暗月初醒",
    subtitle: "第一章",
    kind: "tutorial",
    objective: "确认处境，找到第一条异常线索，理解行动会改变后果。",
    minTurns: 3,
    targetTurns: 4,
    maxTurns: 6,
    minKeyChoices: 1,
    targetKeyChoices: 2,
    targetTextChars: [900, 1800],
    hardTextChars: 2200,
    beats: [
      { id: "wake", label: "醒来", description: "确认当前处境。", required: true },
      { id: "observe", label: "观察异常", description: "发现环境中不合常理的细节。", required: true },
      { id: "first-choice", label: "第一次选择", description: "用行动或选项推动局势。", required: true },
      { id: "first-clue", label: "获得线索", description: "让至少一条结构化线索或状态变化落地。", required: true },
      { id: "hook", label: "章末钩子", description: "把目标指向下一处调查。", required: true },
    ],
    endHook: "新的线索已经指向门后更深的回声。",
    nextChapterId: CHAPTER_TWO_ID,
  },
  {
    id: CHAPTER_TWO_ID,
    order: 2,
    title: "第二章",
    subtitle: "第二章",
    kind: "tutorial",
    objective: "沿第一章线索继续探索，面对第一个更明确的阻碍或 NPC 迹象。",
    minTurns: 4,
    targetTurns: 5,
    maxTurns: 7,
    minKeyChoices: 2,
    targetKeyChoices: 2,
    targetTextChars: [1200, 2200],
    hardTextChars: 2600,
    beats: [
      { id: "new-objective", label: "新目标", description: "明确下一处调查方向。", required: true },
      { id: "search", label: "搜查判断", description: "围绕线索做出判断或搜查。", required: true },
      { id: "obstacle", label: "阻碍出现", description: "遭遇门、人物或异常的阻碍。", required: true },
      { id: "key-choice", label: "关键选择", description: "承担一次有后果的选择。", required: true },
      { id: "state-change", label: "状态变化", description: "让风险、线索或关系发生变化。", required: true },
      { id: "next-risk", label: "下一风险", description: "把风险推进到下一阶段。", required: true },
    ],
    endHook: "门后的声音还没有停，它在等待你继续靠近。",
    previousChapterId: CHAPTER_ONE_ID,
    nextChapterId: "chapter-3" as ChapterId,
  },
] as const;

// 静态种子定义；动态章节由 ensureChapterDefinitionForOrder 按需生成。
export const CHAPTER_DEFINITIONS: readonly ChapterDefinition[] = SEED_CHAPTER_DEFINITIONS;

export function chapterIdForOrder(order: number): ChapterId {
  const safe = Math.max(1, Math.trunc(Number(order)));
  return `chapter-${safe}` as ChapterId;
}

export function parseChapterOrderFromId(id: ChapterId | null | undefined): number | null {
  if (!id || typeof id !== "string") return null;
  const match = /^chapter-(\d+)$/.exec(id);
  if (!match) return null;
  const order = Number(match[1]);
  return Number.isFinite(order) && order >= 1 ? order : null;
}

const dynamicDefinitionCache = new Map<number, ChapterDefinition>();

function buildDynamicChapterDefinition(order: number): ChapterDefinition {
  const safeOrder = Math.max(3, Math.trunc(order));
  const cached = dynamicDefinitionCache.get(safeOrder);
  if (cached) return cached;
  const definition: ChapterDefinition = {
    id: chapterIdForOrder(safeOrder),
    order: safeOrder,
    title: `第${safeOrder}章`,
    subtitle: `第${safeOrder}章`,
    kind: "standard",
    objective: "沿当前线索继续推进，把风险与目标推到下一阶段。",
    minTurns: 4,
    targetTurns: 5,
    maxTurns: 8,
    minKeyChoices: 2,
    targetKeyChoices: 2,
    targetTextChars: [1200, 2200],
    hardTextChars: 2600,
    beats: [
      { id: "objective", label: "新目标", description: "明确下一处调查方向。", required: true },
      { id: "search", label: "搜查判断", description: "围绕线索做出判断或搜查。", required: true },
      { id: "obstacle", label: "阻碍出现", description: "遭遇门、人物或异常的阻碍。", required: true },
      { id: "key-choice", label: "关键选择", description: "承担一次有后果的选择。", required: true },
      { id: "state-change", label: "状态变化", description: "让风险、线索或关系发生变化。", required: true },
      { id: "next-risk", label: "下一风险", description: "把风险推进到下一阶段。", required: true },
    ],
    endHook: "门后的声音还没有停，它在等待你继续靠近。",
    previousChapterId: chapterIdForOrder(safeOrder - 1),
    nextChapterId: chapterIdForOrder(safeOrder + 1),
  };
  dynamicDefinitionCache.set(safeOrder, definition);
  return definition;
}

export function ensureChapterDefinitionForOrder(order: number): ChapterDefinition {
  const safeOrder = Math.max(1, Math.trunc(Number(order)));
  const seed = SEED_CHAPTER_DEFINITIONS.find((definition) => definition.order === safeOrder);
  if (seed) return seed;
  return buildDynamicChapterDefinition(safeOrder);
}

export function getChapterDefinition(id: ChapterId | null | undefined): ChapterDefinition | null {
  if (!id) return null;
  const seed = SEED_CHAPTER_DEFINITIONS.find((chapter) => chapter.id === id);
  if (seed) return seed;
  const order = parseChapterOrderFromId(id);
  if (order && order >= 1) return ensureChapterDefinitionForOrder(order);
  return null;
}

export function getChapterDefinitionByOrder(order: number): ChapterDefinition | null {
  return ensureChapterDefinitionForOrder(order);
}

export function getFirstChapterDefinition(): ChapterDefinition {
  return SEED_CHAPTER_DEFINITIONS[0];
}

/**
 * 返回从第 1 章直到 maxOrder 章（或到种子表末尾，取较大者）的连续章节定义；
 * 用于章节导航/设置等需要枚举所有已开放章节的场景。
 */
export function getChapterDefinitionsUpToOrder(maxOrder: number): readonly ChapterDefinition[] {
  const safeMax = Math.max(SEED_CHAPTER_DEFINITIONS.length, Math.trunc(Number(maxOrder)) || 0);
  const out: ChapterDefinition[] = [];
  for (let i = 1; i <= safeMax; i++) out.push(ensureChapterDefinitionForOrder(i));
  return out;
}

/**
 * 基于章节状态推断需要枚举的章节集合（按 order 升序）。
 * 涵盖：种子定义 + 已解锁/已完成 + 当前激活/回看的章节。
 */
export function listChapterDefinitionsForState(input: {
  activeChapterId?: ChapterId | null;
  reviewChapterId?: ChapterId | null;
  unlockedChapterIds?: ChapterId[];
  completedChapterIds?: ChapterId[];
  progressByChapterId?: Record<string, unknown>;
}): readonly ChapterDefinition[] {
  const orders = new Set<number>();
  for (const def of SEED_CHAPTER_DEFINITIONS) orders.add(def.order);
  const collectFromIds = (ids: ChapterId[] | undefined) => {
    if (!Array.isArray(ids)) return;
    for (const id of ids) {
      const order = parseChapterOrderFromId(id);
      if (order && order >= 1) orders.add(order);
    }
  };
  collectFromIds(input.unlockedChapterIds);
  collectFromIds(input.completedChapterIds);
  if (input.activeChapterId) {
    const o = parseChapterOrderFromId(input.activeChapterId);
    if (o && o >= 1) orders.add(o);
  }
  if (input.reviewChapterId) {
    const o = parseChapterOrderFromId(input.reviewChapterId);
    if (o && o >= 1) orders.add(o);
  }
  if (input.progressByChapterId && typeof input.progressByChapterId === "object") {
    for (const id of Object.keys(input.progressByChapterId)) {
      const o = parseChapterOrderFromId(id as ChapterId);
      if (o && o >= 1) orders.add(o);
    }
  }
  return Array.from(orders)
    .sort((a, b) => a - b)
    .map((o) => ensureChapterDefinitionForOrder(o));
}

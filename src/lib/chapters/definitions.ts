import type { ChapterDefinition, ChapterId } from "./types";

export const CHAPTER_ONE_ID = "chapter-1" as const;
export const CHAPTER_TWO_ID = "chapter-2" as const;

export const CHAPTER_DEFINITIONS: readonly ChapterDefinition[] = [
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
    title: "门后回声",
    subtitle: "第二章",
    kind: "tutorial",
    objective: "沿第一章线索继续探索，面对第一个更明确的阻碍或 NPC 迹象。",
    minTurns: 4,
    targetTurns: 5,
    maxTurns: 7,
    minKeyChoices: 2,
    targetKeyChoices: 2,
    targetTextChars: [1200, 2200],
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
  },
] as const;

export function getChapterDefinition(id: ChapterId | null | undefined): ChapterDefinition | null {
  if (!id) return null;
  return CHAPTER_DEFINITIONS.find((chapter) => chapter.id === id) ?? null;
}

export function getChapterDefinitionByOrder(order: number): ChapterDefinition | null {
  return CHAPTER_DEFINITIONS.find((chapter) => chapter.order === order) ?? null;
}

export function getFirstChapterDefinition(): ChapterDefinition {
  return CHAPTER_DEFINITIONS[0];
}

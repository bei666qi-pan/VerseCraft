export type BeatMode = "quiet" | "pressure" | "reveal" | "collision" | "countdown" | "peak" | "aftershock";

export type ChapterPhase =
  | "opening"
  | "rising"
  | "choice"
  | "echo"
  | "reveal"
  | "aftershock"
  | "closing";

export type ChapterCloseDecision = {
  shouldClose: boolean;
  confidence: number;

  hasResolvedSmallQuestion: boolean;
  hasNewHook: boolean;
  hasPlayerChoiceEcho: boolean;
  hasReadablePause: boolean;
  hasNoLoreConflict: boolean;

  reason: string;
  playerRecapCandidate: string;
  modelSummaryCandidate: string;
  nextChapterTitleCandidate: string | null;
};

export type NextChapterSeed = {
  title: string;
  promise: string;
  mainQuestion: string;
  emotionalTone: string;
  mustEchoMemoryIds: string[];
  inheritedThreadIds: string[];
};

export type PacingChapterState = {
  v: 1;
  currentChapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterPhase: ChapterPhase;

  promise: string;
  mainQuestion: string;
  emotionalTone: string;

  startedTurn: number;
  minTurns: number;
  targetTurns: [number, number];
  softMaxTurns: number;

  openThreadIds: string[];
  resolvedThreadIds: string[];
  keyChoiceIds: string[];
  echoedChoiceIds: string[];
  mustEchoMemoryIds: string[];
  forbiddenRevealIds: string[];

  closeCandidate: ChapterCloseDecision | null;
  nextChapterSeed: NextChapterSeed | null;

  summaryForPlayer: string | null;
  summaryForModel: string | null;
};

export type ChapterPressureFlag =
  | "stalling"
  | "high_threat"
  | "debt_pileup"
  | "promise_pileup"
  | "hooks_ready";

export type ChapterPacingState = {
  v: 1;
  arcId: string;
  beatIndex: number;
  tension: number; // 0..100
  stallCount: number;
  lastProgressTurn: number;
  recentProgressTurns: number[];
  recentPeakTurn: number;
  openHookCodes: string[]; // short codes only
  falseCalmTurns: number;
  pressureBudget: number; // 0..100
  escapePressureBand: "low" | "mid" | "high";
  chapter: PacingChapterState;
};

export type ChapterPacingPlan = {
  beatMode: BeatMode;
  mustAdvance: boolean;
  mustRecallHookCodes: string[];
  pressureFlags: ChapterPressureFlag[];
};

export function createInitialPacingChapterState(
  nowTurn: number,
  overrides: Partial<Pick<
    PacingChapterState,
    | "currentChapterId"
    | "chapterOrder"
    | "chapterTitle"
    | "promise"
    | "mainQuestion"
    | "emotionalTone"
    | "minTurns"
    | "targetTurns"
    | "softMaxTurns"
  >> = {}
): PacingChapterState {
  const startedTurn = Math.max(0, Math.trunc(Number(nowTurn) || 0));
  return {
    v: 1,
    currentChapterId: overrides.currentChapterId ?? "chapter-1",
    chapterOrder: Math.max(1, Math.trunc(Number(overrides.chapterOrder ?? 1) || 1)),
    chapterTitle: overrides.chapterTitle ?? "暗月初醒",
    chapterPhase: "opening",
    promise:
      overrides.promise ??
      "玩家从异常中醒来，必须确认眼前处境，并让第一个选择留下可回响的痕迹。",
    mainQuestion:
      overrides.mainQuestion ??
      "这座公寓为什么在暗月下改变，玩家刚做出的选择会被谁记住？",
    emotionalTone: overrides.emotionalTone ?? "悬疑、克制、压迫感逐步靠近",
    startedTurn,
    minTurns: Math.max(1, Math.trunc(Number(overrides.minTurns ?? 3) || 3)),
    targetTurns: Array.isArray(overrides.targetTurns)
      ? [
          Math.max(1, Math.trunc(Number(overrides.targetTurns[0]) || 4)),
          Math.max(2, Math.trunc(Number(overrides.targetTurns[1]) || 8)),
        ]
      : [4, 8],
    softMaxTurns: Math.max(2, Math.trunc(Number(overrides.softMaxTurns ?? 10) || 10)),
    openThreadIds: [],
    resolvedThreadIds: [],
    keyChoiceIds: [],
    echoedChoiceIds: [],
    mustEchoMemoryIds: [],
    forbiddenRevealIds: [],
    closeCandidate: null,
    nextChapterSeed: null,
    summaryForPlayer: null,
    summaryForModel: null,
  };
}

export function createInitialChapterPacingState(nowTurn: number): ChapterPacingState {
  return {
    v: 1,
    arcId: "arc_main",
    beatIndex: 0,
    tension: 18,
    stallCount: 0,
    lastProgressTurn: Math.max(0, nowTurn),
    recentProgressTurns: [],
    recentPeakTurn: Math.max(0, nowTurn - 99),
    openHookCodes: [],
    falseCalmTurns: 0,
    pressureBudget: 45,
    escapePressureBand: "low",
    chapter: createInitialPacingChapterState(nowTurn),
  };
}

/**
 * 章节节奏控制器半程触发偏移：章节进行到 `ceil(minTurns/2) + offset` 时开始准备
 * 下一章的 nextChapterSeed。chapter-1 (minTurns=3) 默认在 3 回合后开始，
 * 符合「章节控制器在章节进行到一半后准备下一章」的契约。
 *
 * 详见 CLAUDE.md §章节 Pacing 计划与字数约束 / AGENTS.md §2.3。
 */
export const CHAPTER_PACING_PLAN_TRIGGER_TURN_OFFSET = 1;
export const CHAPTER_PACING_PLAN_MIN_TRIGGER_TURN = 2;

export function chapterPacingTriggerTurnIndex(chapter: Pick<PacingChapterState, "minTurns">): number {
  const minTurns = Math.max(1, Math.trunc(Number(chapter?.minTurns ?? 1) || 1));
  const halfway = Math.ceil(minTurns / 2);
  return Math.max(
    CHAPTER_PACING_PLAN_MIN_TRIGGER_TURN,
    halfway + CHAPTER_PACING_PLAN_TRIGGER_TURN_OFFSET,
  );
}

export function shouldChapterPacingBuildNextChapterSeed(args: {
  chapter: Pick<PacingChapterState, "minTurns" | "startedTurn" | "closeCandidate">;
  nowTurn: number;
}): boolean {
  const nowTurn = Math.max(0, Math.trunc(Number(args.nowTurn) || 0));
  const startedTurn = Math.max(0, Math.trunc(Number(args.chapter?.startedTurn) || 0));
  const turnsInChapter = Math.max(0, nowTurn - startedTurn);
  if (args.chapter?.closeCandidate?.shouldClose === true) return true;
  return turnsInChapter >= chapterPacingTriggerTurnIndex(args.chapter);
}

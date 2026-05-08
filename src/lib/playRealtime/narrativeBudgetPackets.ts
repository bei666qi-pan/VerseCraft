export type NarrativeBudgetTier =
  | "micro"
  | "short"
  | "standard"
  | "reveal"
  | "climax"
  | "ending";

export type NarrativeBudget = {
  schema: "narrative_budget_v1";
  tier: NarrativeBudgetTier;
  minChars: number;
  targetChars: number;
  maxChars: number;
  minInfoBeats: number;
  mustInclude: string[];
  stopRule: string;
  reasonCodes: string[];
  chapter?: NarrativeBudgetChapterCaps;
};

export type NarrativeBudgetChapterCaps = {
  id: string;
  currentChars: number;
  targetMinChars: number;
  targetMaxChars: number;
  hardMaxChars: number;
  remainingHardChars: number;
  shouldClose: boolean;
};

export type NarrativeBudgetChapterInput = {
  chapterId?: string | null;
  narrativeCharCount?: number | null;
  targetTextChars?: readonly [number, number] | readonly number[] | null;
  hardTextChars?: number | null;
};

export type ResolveNarrativeBudgetArgs = {
  plannedTurnMode?: string | null;
  riskLane?: string | null;
  latestUserInput?: string | null;
  playerContext?: unknown;
  clientState?: unknown;
  isFirstAction?: boolean;
  currentLocation?: string | null;
  presentNpcIds?: readonly string[] | null;
  recentNarrativeTail?: string | null;
  isEndgame?: boolean;
  isChapterClimax?: boolean;
  chapter?: NarrativeBudgetChapterInput | null;
};

type TierBudgetDefaults = Omit<NarrativeBudget, "schema" | "tier" | "reasonCodes">;

const SCHEMA: NarrativeBudget["schema"] = "narrative_budget_v1";
const MAX_SIGNAL_CHARS = 6000;
const STABLE_REASON_CODE = /^[a-z][a-z0-9_]{1,40}$/;

const TIER_BUDGETS: Record<NarrativeBudgetTier, TierBudgetDefaults> = {
  micro: {
    minChars: 80,
    targetChars: 120,
    maxChars: 160,
    minInfoBeats: 2,
    mustInclude: ["承接上一段尾巴", "吸收玩家动作", "危险瞬间", "明确抉择压力"],
    stopRule: "抛出关键后果或抉择压力后立刻停笔，不解释答案",
  },
  short: {
    minChars: 160,
    targetChars: 220,
    maxChars: 260,
    minInfoBeats: 3,
    mustInclude: ["承接上一段尾巴", "吸收玩家动作", "即时反馈"],
    stopRule: "完成即时反馈后停笔，不扩写背景",
  },
  standard: {
    minChars: 260,
    targetChars: 420,
    maxChars: 520,
    minInfoBeats: 4,
    mustInclude: ["承接上一段尾巴", "吸收玩家动作", "环境反馈", "风险或关系变化"],
    stopRule: "达到目标信息量后停笔，不凑字",
  },
  reveal: {
    minChars: 520,
    targetChars: 680,
    maxChars: 850,
    minInfoBeats: 5,
    mustInclude: ["承接上一段尾巴", "吸收玩家动作", "高价值线索", "角色反应或代价", "新的疑问"],
    stopRule: "揭示到本回合允许层级后停笔，保留未解问题",
  },
  climax: {
    minChars: 700,
    targetChars: 900,
    maxChars: 1100,
    minInfoBeats: 6,
    mustInclude: ["承接上一段尾巴", "吸收玩家动作", "危机爆发", "关键后果", "下一步压力"],
    stopRule: "写出危机后果与下一步压力后停笔，禁止提前解决",
  },
  ending: {
    minChars: 600,
    targetChars: 850,
    maxChars: 1200,
    minInfoBeats: 6,
    mustInclude: ["承接上一段尾巴", "吸收玩家动作", "结局状态", "代价回收", "余波钩子"],
    stopRule: "完成结局状态和余波回收后停笔，保留上限保护",
  },
};

const TIER_CHAR_LIMITS: Record<NarrativeBudgetTier, { floor: number; ceiling: number }> = {
  micro: { floor: 60, ceiling: 220 },
  short: { floor: 120, ceiling: 340 },
  standard: { floor: 220, ceiling: 650 },
  reveal: { floor: 420, ceiling: 980 },
  climax: { floor: 560, ceiling: 1250 },
  ending: { floor: 520, ceiling: 1400 },
};

const DANGER_STOP_KEYWORDS = [
  "危险骤停",
  "死亡边缘",
  "濒死",
  "快死",
  "别动",
  "停住",
  "来不及",
  "倒计时",
  "冲过来",
  "扑来",
  "追上",
  "血",
  "理智归零",
  "sanity:0",
];

const KEY_CHOICE_KEYWORDS = [
  "强悬念断点",
  "关键抉择",
  "必须选择",
  "立刻选择",
  "二选一",
  "选一个",
  "救谁",
  "牺牲",
  "来不及思考",
];

const CLIMAX_KEYWORDS = ["章节高潮", "重大危机", "主威胁", "强介入", "重大转折", "爆发", "坍塌", "追猎"];

const HIGH_VALUE_CLUE_KEYWORDS = [
  "高价值线索",
  "关键线索",
  "重要线索",
  "关键物品",
  "关键任务",
  "世界观",
  "真相",
  "秘密",
  "档案",
  "证据",
  "徽章",
  "钥匙",
  "日记",
  "录音",
  "校源",
  "七锚",
  "如月",
  "暗月",
];

const RELATION_REVEAL_KEYWORDS = ["情绪变化", "关系突破", "信任", "崩溃", "坦白", "记得", "隐瞒", "承认"];
const NPC_DIALOGUE_KEYWORDS = ["问", "说", "告诉", "交谈", "对话", "安慰", "逼问", "质问", "请求", "喊"];
const SIMPLE_ACTION_KEYWORDS = ["推开", "打开", "关上", "敲门", "后退", "靠近", "拿起", "放下", "点头", "坐下", "站起", "跟上", "听一下", "看一眼"];
const LIGHT_INVESTIGATION_KEYWORDS = ["简单查看", "快速检查", "随便看看", "摸一下", "听一下", "轻轻敲"];
const EXPLORE_KEYWORDS = ["探索", "调查", "搜索", "仔细观察", "检查", "沿着", "进入", "查看房间", "场景推进"];

export function resolveNarrativeBudget(args: ResolveNarrativeBudgetArgs): NarrativeBudget {
  const plannedTurnMode = normalizeText(args.plannedTurnMode);
  const riskLane = normalizeText(args.riskLane);
  const latestUserInput = normalizeText(args.latestUserInput);
  const signalText = buildSignalText(args);
  const reasonCodes: string[] = [];

  const hasDangerStop = containsAny(signalText, DANGER_STOP_KEYWORDS);
  const hasKeyChoice = containsAny(signalText, KEY_CHOICE_KEYWORDS);
  const hasClimax = Boolean(args.isChapterClimax) || containsAny(signalText, CLIMAX_KEYWORDS);
  const hasHighValueClue = containsAny(signalText, HIGH_VALUE_CLUE_KEYWORDS);
  const hasNpc = (args.presentNpcIds?.length ?? 0) > 0;
  const hasDialogue = containsAny(latestUserInput, NPC_DIALOGUE_KEYWORDS);
  const hasImportantNpcDialogue =
    hasNpc && hasDialogue && (containsAny(signalText, RELATION_REVEAL_KEYWORDS) || hasHighValueClue);
  const hasRevealSignal = hasHighValueClue || hasImportantNpcDialogue || containsAny(signalText, RELATION_REVEAL_KEYWORDS);
  const isEnding =
    Boolean(args.isEndgame) ||
    plannedTurnMode.includes("ending") ||
    plannedTurnMode.includes("endgame") ||
    containsAny(signalText, ["终局", "结局", "章节终局", "复盘"]);

  let tier: NarrativeBudgetTier;

  if (isEnding) {
    tier = "ending";
    reasonCodes.push("ending");
  } else if (hasDangerStop || hasKeyChoice) {
    tier = "micro";
    if (hasDangerStop) {
      reasonCodes.push("danger_stop");
    }
    if (hasKeyChoice) {
      reasonCodes.push("key_choice");
    }
  } else if (hasClimax) {
    tier = "climax";
    reasonCodes.push("chapter_climax");
  } else if (hasRevealSignal) {
    tier = "reveal";
    if (hasHighValueClue) {
      reasonCodes.push("high_value_clue");
    }
    if (hasImportantNpcDialogue) {
      reasonCodes.push("important_npc");
    }
    if (containsAny(signalText, RELATION_REVEAL_KEYWORDS)) {
      reasonCodes.push("relationship_shift");
    }
  } else if (isShortTurn(latestUserInput, signalText, hasNpc, hasDialogue)) {
    tier = "short";
    reasonCodes.push(hasDialogue ? "light_dialogue" : "simple_action");
  } else {
    tier = "standard";
    if (args.isFirstAction) {
      reasonCodes.push("first_action");
    }
    reasonCodes.push(containsAny(signalText, EXPLORE_KEYWORDS) ? "explore" : "normal_turn");
  }

  if (riskLane.includes("slow")) {
    reasonCodes.push("slow_lane");
  } else {
    reasonCodes.push("normal_risk");
  }

  return createBudget(tier, reasonCodes, args.chapter ?? null);
}

export function buildNarrativeBudgetPacketBlock(budget: NarrativeBudget): string {
  return `## 【narrative_budget_packet】\n${JSON.stringify(normalizeNarrativeBudget(budget))}`;
}

function createBudget(
  tier: NarrativeBudgetTier,
  reasonCodes: readonly string[],
  chapter?: NarrativeBudgetChapterInput | null,
): NarrativeBudget {
  return normalizeNarrativeBudget({
    schema: SCHEMA,
    tier,
    ...TIER_BUDGETS[tier],
    reasonCodes: [...reasonCodes],
    ...(chapter ? { chapter: normalizeChapterCaps(chapter) } : {}),
  });
}

function normalizeNarrativeBudget(budget: NarrativeBudget): NarrativeBudget {
  const tier = budget.tier;
  const defaults = TIER_BUDGETS[tier];
  const numbers = clampBudgetNumbers(tier, {
    minChars: budget.minChars,
    targetChars: budget.targetChars,
    maxChars: budget.maxChars,
  });

  const chapter = budget.chapter ? normalizeChapterCaps(budget.chapter) : undefined;
  const cappedNumbers = applyChapterCaps(numbers, chapter);

  return {
    schema: SCHEMA,
    tier,
    minChars: cappedNumbers.minChars,
    targetChars: cappedNumbers.targetChars,
    maxChars: cappedNumbers.maxChars,
    minInfoBeats: clampInteger(budget.minInfoBeats, defaults.minInfoBeats, 1, 8),
    mustInclude: sanitizeStringList(budget.mustInclude, defaults.mustInclude, 8),
    stopRule: normalizeText(budget.stopRule) || defaults.stopRule,
    reasonCodes: sanitizeReasonCodes(
      chapter?.shouldClose ? [...budget.reasonCodes, "chapter_close_due"] : budget.reasonCodes,
      ["manual_budget"]
    ),
    ...(chapter ? { chapter } : {}),
  };
}

function clampBudgetNumbers(
  tier: NarrativeBudgetTier,
  numbers: Pick<NarrativeBudget, "minChars" | "targetChars" | "maxChars">,
): Pick<NarrativeBudget, "minChars" | "targetChars" | "maxChars"> {
  const limits = TIER_CHAR_LIMITS[tier];
  const defaults = TIER_BUDGETS[tier];
  let minChars = clampInteger(numbers.minChars, defaults.minChars, limits.floor, limits.ceiling - 20);
  const maxChars = clampInteger(numbers.maxChars, defaults.maxChars, minChars + 20, limits.ceiling);
  minChars = Math.min(minChars, maxChars - 20);
  const targetChars = clampInteger(numbers.targetChars, defaults.targetChars, minChars, maxChars);

  return { minChars, targetChars, maxChars };
}

function normalizeChapterCaps(input: NarrativeBudgetChapterInput | NarrativeBudgetChapterCaps): NarrativeBudgetChapterCaps {
  const source = input as NarrativeBudgetChapterInput & NarrativeBudgetChapterCaps;
  const target = Array.isArray(source.targetTextChars)
    ? source.targetTextChars
    : [Number(source.targetMinChars), Number(source.targetMaxChars)];
  const hardRaw = Number(source.hardTextChars ?? source.hardMaxChars ?? target[1] ?? 3000);
  const hardMaxChars = clampInteger(hardRaw, 3000, 200, 10_000);
  const targetMinChars = clampInteger(target[0], Math.min(1200, hardMaxChars - 20), 80, Math.max(80, hardMaxChars - 20));
  const targetMaxChars = clampInteger(target[1], Math.min(2400, hardMaxChars), targetMinChars + 20, hardMaxChars);
  const currentChars = clampInteger(source.narrativeCharCount ?? source.currentChars ?? 0, 0, 0, 1_000_000);
  const remainingHardChars = Math.max(0, hardMaxChars - currentChars);
  return {
    id: normalizeText(source.chapterId ?? source.id ?? "chapter"),
    currentChars,
    targetMinChars,
    targetMaxChars,
    hardMaxChars,
    remainingHardChars,
    shouldClose: currentChars >= targetMaxChars || remainingHardChars <= 220,
  };
}

function applyChapterCaps(
  numbers: Pick<NarrativeBudget, "minChars" | "targetChars" | "maxChars">,
  chapter: NarrativeBudgetChapterCaps | undefined
): Pick<NarrativeBudget, "minChars" | "targetChars" | "maxChars"> {
  if (!chapter) return numbers;
  if (chapter.remainingHardChars <= 0) {
    return { minChars: 40, targetChars: 80, maxChars: 120 };
  }
  const maxChars = Math.max(40, Math.min(numbers.maxChars, chapter.remainingHardChars));
  const targetChars = Math.max(40, Math.min(numbers.targetChars, maxChars));
  const minChars = Math.max(20, Math.min(numbers.minChars, targetChars));
  return { minChars, targetChars, maxChars };
}

function isShortTurn(latestUserInput: string, signalText: string, hasNpc: boolean, hasDialogue: boolean): boolean {
  const inputChars = countChars(latestUserInput);
  const hasSimpleAction = inputChars > 0 && inputChars <= 18 && containsAny(latestUserInput, SIMPLE_ACTION_KEYWORDS);
  const hasLightInvestigation = containsAny(latestUserInput, LIGHT_INVESTIGATION_KEYWORDS);
  const hasShortDialogue = hasNpc && hasDialogue && inputChars <= 24;
  const hasExploration = containsAny(signalText, EXPLORE_KEYWORDS) && !hasLightInvestigation;

  return (hasSimpleAction || hasLightInvestigation || hasShortDialogue) && !hasExploration;
}

function buildSignalText(args: ResolveNarrativeBudgetArgs): string {
  return [
    args.plannedTurnMode,
    args.riskLane,
    args.latestUserInput,
    args.playerContext,
    args.clientState,
    args.currentLocation,
    args.presentNpcIds,
    args.recentNarrativeTail,
    args.chapter,
  ]
    .map(valueToSearchText)
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_SIGNAL_CHARS)
    .toLowerCase();
}

function valueToSearchText(value: unknown, depth = 0): string {
  if (value == null || depth > 2) {
    return "";
  }
  if (typeof value === "string") {
    return normalizeText(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => valueToSearchText(item, depth + 1)).join(" ");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 32)
      .map(([key, item]) => `${key}:${valueToSearchText(item, depth + 1)}`)
      .join(" ");
  }
  return "";
}

function containsAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function countChars(value: string): number {
  return Array.from(value.replace(/\s+/g, "")).length;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function sanitizeStringList(value: readonly string[], fallback: readonly string[], limit: number): string[] {
  const source = value.length > 0 ? value : fallback;
  return unique(
    source
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .map((item) => item.slice(0, 48)),
  ).slice(0, limit);
}

function sanitizeReasonCodes(reasonCodes: readonly string[], fallback: readonly string[]): string[] {
  const stableCodes = unique(reasonCodes.map((code) => normalizeText(code)).filter((code) => STABLE_REASON_CODE.test(code)));
  return stableCodes.length > 0 ? stableCodes.slice(0, 8) : [...fallback];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

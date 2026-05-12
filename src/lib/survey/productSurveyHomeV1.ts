/** 首页产品问卷：与分析目标绑定的结构化字段（surveyKey 升级时可换版） */
export const PRODUCT_SURVEY_KEY_HOME = "product_research_home";
export const PRODUCT_SURVEY_VERSION_HOME = "1.3.0";

export type HomeSurveyAnswers = {
  /** 你从哪里知道 VerseCraft（获客渠道） */
  discoverySource: string;
  /** 你当前体验阶段（首次/多次） */
  experienceStage: string;
  /** 角色创建流程中最容易犹豫/烦躁的点 */
  createFriction: string;
  /** 正式游玩中最影响沉浸感的问题 */
  immersionIssue: string;
  /** 当前最好玩的核心点 */
  coreFunPoint: string;
  /** 中途退出/不继续玩的主要原因 */
  quitReason: string;
  /** 如果只能提一个最该优先修掉的问题 */
  topFixOne: string;
  /** 是否担心进度/历史/存档丢失 */
  saveLossConcern: string;
  /** 是否愿意推荐朋友来玩 */
  recommendWillingness: string;
  /** 末尾开放建议 */
  finalSuggestion: string;
};

export const DISCOVERY_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "friend", label: "朋友推荐" },
  { value: "qq_group", label: "QQ群/社群" },
  { value: "bilibili", label: "B站" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "douyin", label: "抖音/快手" },
  { value: "search", label: "搜索/浏览器" },
  { value: "github", label: "GitHub/开源渠道" },
  { value: "other", label: "其他/忘了" },
];

export const EXPERIENCE_STAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "first_time", label: "第一次来" },
  { value: "second_time", label: "第二次（刚回访）" },
  { value: "multi_time", label: "来过很多次/持续在玩" },
  { value: "returning_long_gap", label: "隔了挺久又回来" },
];

export const CREATE_FRICTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "name_personality", label: "名字 / 性格填写" },
  { value: "attribute_distribution", label: "属性分配" },
  { value: "talent_selection", label: "天赋选择" },
  { value: "not_understand_attributes", label: "我不理解这些属性有什么区别" },
  { value: "not_sure_best_build", label: "我不确定怎么配才不吃亏" },
  { value: "overall_ok", label: "整体都还好" },
  { value: "churned_here", label: "我在这里直接流失 / 退出过" },
];

export const IMMERSION_ISSUE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "reply_wait_too_long", label: "等待回复太久" },
  { value: "dont_know_next_step", label: "我不知道下一步该做什么" },
  { value: "profession_weapon_incomplete", label: "职业 / 武器 / 玩法看起来不完整" },
  { value: "too_many_rules", label: "规则太多，我看不懂" },
  { value: "text_quality_unstable", label: "文本有时很好，有时不稳定" },
  { value: "ui_path_complex", label: "UI 操作路径绕" },
  { value: "no_obvious_issue", label: "暂时没有明显问题" },
];

export const CORE_FUN_POINT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ai_narrative_presence", label: "AI 叙事和临场感" },
  { value: "weird_worldview", label: "异常公寓悬疑氛围" },
  { value: "action_feedback", label: "选择行动后的反馈" },
  { value: "npc_interaction", label: "人物 / NPC 互动" },
  { value: "explore_unknown", label: "探索和推进未知区域" },
  { value: "growth_system", label: "职业 / 道具 / 武器成长" },
  { value: "no_standout_yet", label: "现在还没有一个特别突出的点" },
];

export const QUIT_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "hard_to_understand", label: "不够好懂，进入门槛高" },
  { value: "save_progress_insecure", label: "进度 / 存档让我没有安全感" },
  { value: "wait_too_long", label: "等待时间偏久" },
  { value: "lack_long_term_goals", label: "玩法深度还不够，缺少持续目标" },
  { value: "text_unstable", label: "文本体验还不够稳定" },
  { value: "no_time_now", label: "我只是暂时没时间" },
  { value: "other", label: "其他" },
];

export const SAVE_LOSS_CONCERN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "not_worried_at_all", label: "完全不担心" },
  { value: "slightly_worried_acceptable", label: "有一点担心，但还能接受" },
  { value: "quite_worried_frequent_check", label: "比较担心，所以会频繁确认" },
  { value: "very_worried_affects_continue", label: "很担心，影响我继续玩" },
  { value: "already_lost_or_cannot_find", label: "我已经遇到过疑似丢档 / 不知道档在哪" },
];

export const RECOMMEND_WILLINGNESS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "very_willing", label: "很愿意" },
  { value: "quite_willing", label: "挺愿意" },
  { value: "depends", label: "看情况" },
  { value: "considering", label: "考虑下" },
  { value: "unwilling", label: "不愿意" },
];

export type HomeSurveyQuestionId = keyof HomeSurveyAnswers;
export type HomeSurveySingleQuestionId = Exclude<HomeSurveyQuestionId, "topFixOne" | "finalSuggestion">;
export type HomeSurveyQuestionConfig =
  | {
      id: HomeSurveySingleQuestionId;
      kind: "single";
      title: string;
      subtitle?: string;
      required: true;
      options: Array<{ value: string; label: string }>;
    }
  | {
      id: "topFixOne" | "finalSuggestion";
      kind: "text";
      title: string;
      subtitle?: string;
      required: boolean;
      maxLen: 500;
      placeholder: string;
    };

/** 首页产品问卷（≤10题）：用于产品分层与决策排序 */
export const HOME_SURVEY_FLOW: HomeSurveyQuestionConfig[] = [
  { id: "discoverySource", kind: "single", required: true, title: "你从哪里知道 VerseCraft？", options: DISCOVERY_SOURCE_OPTIONS },
  { id: "experienceStage", kind: "single", required: true, title: "你现在属于哪种体验阶段？", options: EXPERIENCE_STAGE_OPTIONS },
  { id: "createFriction", kind: "single", required: true, title: "角色创建流程里，哪个部分最容易让你犹豫或烦？", options: CREATE_FRICTION_OPTIONS },
  { id: "immersionIssue", kind: "single", required: true, title: "在正式游玩过程中，哪一种问题最影响你的沉浸感？", options: IMMERSION_ISSUE_OPTIONS },
  { id: "coreFunPoint", kind: "single", required: true, title: "你觉得文界工坊当前“最好玩”的核心点是什么？", options: CORE_FUN_POINT_OPTIONS },
  { id: "quitReason", kind: "single", required: true, title: "如果你中途退出或今天不继续玩，最主要的原因会是什么？", options: QUIT_REASON_OPTIONS },
  {
    id: "topFixOne",
    kind: "text",
    required: true,
    title: "如果只能让你提一个最该优先修掉的问题，你会写什么？",
    maxLen: 500,
    placeholder: "请描述一个最优先修复的问题。",
  },
  {
    id: "saveLossConcern",
    kind: "single",
    required: true,
    title: "你是否担心过“自己的记录、历史会丢”？",
    options: SAVE_LOSS_CONCERN_OPTIONS,
  },
  {
    id: "recommendWillingness",
    kind: "single",
    required: true,
    title: "你是否愿意推荐你的朋友来玩？",
    options: RECOMMEND_WILLINGNESS_OPTIONS,
  },
  {
    id: "finalSuggestion",
    kind: "text",
    required: false,
    title: "最后补充（可选）",
    subtitle: "请尽量具体，最好描述你在哪一步卡住、困惑、流失或不放心。",
    maxLen: 500,
    placeholder: "请尽量具体，最好描述你在哪一步卡住、困惑、流失或不放心。",
  },
];

const HOME_SURVEY_OPTIONS_BY_ID: Record<HomeSurveySingleQuestionId, Array<{ value: string; label: string }>> = {
  discoverySource: DISCOVERY_SOURCE_OPTIONS,
  experienceStage: EXPERIENCE_STAGE_OPTIONS,
  createFriction: CREATE_FRICTION_OPTIONS,
  immersionIssue: IMMERSION_ISSUE_OPTIONS,
  coreFunPoint: CORE_FUN_POINT_OPTIONS,
  quitReason: QUIT_REASON_OPTIONS,
  saveLossConcern: SAVE_LOSS_CONCERN_OPTIONS,
  recommendWillingness: RECOMMEND_WILLINGNESS_OPTIONS,
};

function homeSurveyObjectOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function sanitizeHomeSurveyText(value: unknown, maxChars = 240): string {
  return (typeof value === "string" ? value : "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

export function getHomeSurveyQuestionLabel(id: string): string {
  return HOME_SURVEY_FLOW.find((q) => q.id === id)?.title ?? id;
}

export function getHomeSurveyAnswerLabel(id: HomeSurveyQuestionId, value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "未填写";
  if (id === "topFixOne" || id === "finalSuggestion") return sanitizeHomeSurveyText(raw);
  return HOME_SURVEY_OPTIONS_BY_ID[id].find((opt) => opt.value === raw)?.label ?? raw;
}

export type HomeSurveyAnswerSummary = {
  questionId: HomeSurveyQuestionId;
  title: string;
  kind: "single" | "text";
  value: string;
  label: string;
  filled: boolean;
};

export function summarizeHomeSurveyAnswers(raw: unknown): HomeSurveyAnswerSummary[] {
  const answers = homeSurveyObjectOf(raw);
  return HOME_SURVEY_FLOW.map((q) => {
    const value = typeof answers[q.id] === "string" ? answers[q.id].trim() : "";
    return {
      questionId: q.id,
      title: q.title,
      kind: q.kind,
      value,
      label: getHomeSurveyAnswerLabel(q.id, value),
      filled: value.length > 0,
    };
  });
}

export function normalizeHomeSurveyAnswers(raw: unknown): HomeSurveyAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const discoverySource = typeof o.discoverySource === "string" ? o.discoverySource : "";
  const experienceStage = typeof o.experienceStage === "string" ? o.experienceStage : "";
  const createFriction = typeof o.createFriction === "string" ? o.createFriction : "";
  const immersionIssue = typeof o.immersionIssue === "string" ? o.immersionIssue : "";
  const coreFunPoint = typeof o.coreFunPoint === "string" ? o.coreFunPoint : "";
  const quitReason = typeof o.quitReason === "string" ? o.quitReason : "";
  const topFixOne = typeof o.topFixOne === "string" ? o.topFixOne.trim() : "";
  const saveLossConcern = typeof o.saveLossConcern === "string" ? o.saveLossConcern : "";
  const recommendWillingness = typeof o.recommendWillingness === "string" ? o.recommendWillingness : "";
  const finalSuggestion = typeof o.finalSuggestion === "string" ? o.finalSuggestion.trim() : "";

  if (!DISCOVERY_SOURCE_OPTIONS.some((x) => x.value === discoverySource)) return null;
  if (!EXPERIENCE_STAGE_OPTIONS.some((x) => x.value === experienceStage)) return null;
  if (!CREATE_FRICTION_OPTIONS.some((x) => x.value === createFriction)) return null;
  if (!IMMERSION_ISSUE_OPTIONS.some((x) => x.value === immersionIssue)) return null;
  if (!CORE_FUN_POINT_OPTIONS.some((x) => x.value === coreFunPoint)) return null;
  if (!QUIT_REASON_OPTIONS.some((x) => x.value === quitReason)) return null;
  if (!topFixOne) return null;
  if (!SAVE_LOSS_CONCERN_OPTIONS.some((x) => x.value === saveLossConcern)) return null;
  if (!RECOMMEND_WILLINGNESS_OPTIONS.some((x) => x.value === recommendWillingness)) return null;
  return {
    discoverySource,
    experienceStage,
    createFriction,
    immersionIssue,
    coreFunPoint,
    quitReason,
    topFixOne: topFixOne.slice(0, 500),
    saveLossConcern,
    recommendWillingness,
    finalSuggestion: finalSuggestion.slice(0, 500),
  };
}

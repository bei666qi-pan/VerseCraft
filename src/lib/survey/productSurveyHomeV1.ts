/** 首页产品问卷：与分析目标绑定的结构化字段（surveyKey 升级时可换版） */
export const PRODUCT_SURVEY_KEY_HOME = "product_research_home";
export const PRODUCT_SURVEY_VERSION_HOME = "1.2.0";

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
  /** 若补强可显著提高继续意愿的能力（最多3项） */
  improveWillingnessBoosts: string[];
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
  { value: "weird_worldview", label: "规则怪谈世界观" },
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

export const IMPROVE_WILLINGNESS_BOOST_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "clear_auth_system", label: "更清楚的登录 / 注册 / 账号体系" },
  { value: "reliable_continue_save_history", label: "更可靠的继续冒险 / 云存档 / 历史记录" },
  { value: "complete_profession_system", label: "更完整的职业系统" },
  { value: "complete_weapon_item_forge", label: "更完整的武器 / 道具 /锻造系统" },
  { value: "faster_generation_wait", label: "更丝滑的生成速度和等待体验" },
  { value: "better_newbie_guide", label: "更强的新手引导" },
  { value: "complete_settlement_history", label: "更完整的结算 / 历史中心" },
  { value: "more_long_term_goals", label: "更多可持续目标（任务、成长、成就）" },
  { value: "stable_text_feedback_logic", label: "更稳定的文本质量和反馈逻辑" },
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

export function normalizeHomeSurveyAnswers(raw: unknown): HomeSurveyAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const discoverySource = typeof o.discoverySource === "string" ? o.discoverySource : "";
  const experienceStage = typeof o.experienceStage === "string" ? o.experienceStage : "";
  const createFriction = typeof o.createFriction === "string" ? o.createFriction : "";
  const immersionIssue = typeof o.immersionIssue === "string" ? o.immersionIssue : "";
  const coreFunPoint = typeof o.coreFunPoint === "string" ? o.coreFunPoint : "";
  const quitReason = typeof o.quitReason === "string" ? o.quitReason : "";
  const improveWillingnessBoosts = Array.isArray(o.improveWillingnessBoosts)
    ? Array.from(new Set(o.improveWillingnessBoosts.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean)))
    : [];
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
  if (
    improveWillingnessBoosts.length < 1 ||
    improveWillingnessBoosts.length > 3 ||
    improveWillingnessBoosts.some((v) => !IMPROVE_WILLINGNESS_BOOST_OPTIONS.some((x) => x.value === v))
  ) {
    return null;
  }
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
    improveWillingnessBoosts,
    topFixOne: topFixOne.slice(0, 500),
    saveLossConcern,
    recommendWillingness,
    finalSuggestion: finalSuggestion.slice(0, 500),
  };
}

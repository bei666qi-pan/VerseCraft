export type AdminUserRiskTag =
  | "high_ai_cost"
  | "wait_too_long"
  | "stuck_before_first_action"
  | "survey_negative"
  | "feedback_negative"
  | "save_anxiety"
  | "content_quality_risk";

export type AdminUserDetailEventLike = {
  eventName: string;
  eventTime?: string | null;
  payloadSummary?: Record<string, unknown>;
};

export type AdminUserJourneyStage = {
  currentStage: string | null;
  currentLabel: string | null;
  nextStage: string | null;
  nextLabel: string | null;
  stageIndex: number;
  totalStages: number;
  status: "no_events" | "in_progress" | "completed";
};

export type AdminUserDetailSignalsInput = {
  basic?: { actorType?: string; tokensUsed?: number; playTime?: number } | null;
  recentEvents?: AdminUserDetailEventLike[];
  feedbackAndSurvey?: {
    negativeFeedbackCount?: number;
    negativeSurveyCount?: number;
    saveAnxietyCount?: number;
  };
  aiExperience?: {
    avgLatency?: number;
    failureCount?: number;
    fallbackCount?: number;
    tokenCost?: number;
    slowRequestCount?: number;
  };
  contentPath?: {
    chapters?: Array<{ abandoned?: number }>;
    npcs?: Array<{ failed?: number }>;
  };
};

const JOURNEY_ORDER = [
  ["home_viewed", "首页曝光"],
  ["world_selected", "世界观选择"],
  ["character_create_started", "开始角色创建"],
  ["character_create_success", "角色创建成功"],
  ["enter_main_game", "进入主游戏"],
  ["first_effective_action", "第一轮有效行动"],
  ["third_effective_action", "第三轮有效行动"],
  ["save_created", "创建/同步存档"],
  ["settlement_submitted", "进入结算"],
  ["feedback_submitted", "提交反馈"],
] as const;

const LABEL_BY_STAGE = new Map<string, string>(JOURNEY_ORDER.map(([eventName, label]) => [eventName, label]));

export function deriveAdminUserJourneyStage(events: AdminUserDetailEventLike[] = []): AdminUserJourneyStage {
  const seen = new Set(events.map((event) => event.eventName).filter(Boolean));
  let completedIndex = -1;
  for (let index = 0; index < JOURNEY_ORDER.length; index += 1) {
    if (!seen.has(JOURNEY_ORDER[index]![0])) break;
    completedIndex = index;
  }
  const current = completedIndex >= 0 ? JOURNEY_ORDER[completedIndex]![0] : null;
  const next = completedIndex + 1 < JOURNEY_ORDER.length ? JOURNEY_ORDER[completedIndex + 1]![0] : null;
  return {
    currentStage: current,
    currentLabel: current ? LABEL_BY_STAGE.get(current) ?? current : null,
    nextStage: next,
    nextLabel: next ? LABEL_BY_STAGE.get(next) ?? next : null,
    stageIndex: completedIndex,
    totalStages: JOURNEY_ORDER.length,
    status: events.length === 0 ? "no_events" : next ? "in_progress" : "completed",
  };
}

export function buildAdminUserRiskTags(input: AdminUserDetailSignalsInput): AdminUserRiskTag[] {
  const tags = new Set<AdminUserRiskTag>();
  const ai = input.aiExperience ?? {};
  const fs = input.feedbackAndSurvey ?? {};
  const content = input.contentPath ?? {};
  const events = input.recentEvents ?? [];
  const journey = deriveAdminUserJourneyStage(events);

  if ((ai.tokenCost ?? 0) >= 50_000) tags.add("high_ai_cost");
  if ((ai.avgLatency ?? 0) >= 18_000 || (ai.slowRequestCount ?? 0) > 0) tags.add("wait_too_long");
  if (journey.nextStage === "first_effective_action" && events.some((event) => event.eventName === "enter_main_game")) {
    tags.add("stuck_before_first_action");
  }
  if ((fs.negativeSurveyCount ?? 0) > 0) tags.add("survey_negative");
  if ((fs.negativeFeedbackCount ?? 0) > 0) tags.add("feedback_negative");
  if ((fs.saveAnxietyCount ?? 0) > 0) tags.add("save_anxiety");
  if (
    content.chapters?.some((chapter) => (chapter.abandoned ?? 0) > 0) ||
    content.npcs?.some((npc) => (npc.failed ?? 0) > 0) ||
    events.some((event) => /validator|safety|failed|abandoned|retry|regen/.test(event.eventName))
  ) {
    tags.add("content_quality_risk");
  }
  return [...tags];
}

export function buildAdminUserSuggestedOpsActions(tags: AdminUserRiskTag[], journey: AdminUserJourneyStage): string[] {
  const actions: string[] = [];
  if (tags.includes("wait_too_long")) actions.push("优先复核该 actor 的等待耗时、队列状态与 AI fallback 记录。");
  if (tags.includes("high_ai_cost")) actions.push("抽查高 token 回合，确认是否存在重复重试、过长 prompt 或异常上下文膨胀。");
  if (tags.includes("stuck_before_first_action")) actions.push("补充首行动前引导，检查世界选择到首次行动之间是否缺少明确下一步。");
  if (tags.includes("survey_negative") || tags.includes("feedback_negative")) actions.push("查看最近反馈/问卷摘要，按主题进入产品修复或人工回访。");
  if (tags.includes("save_anxiety")) actions.push("检查存档提示、继续游戏入口和云同步反馈是否足够明确。");
  if (tags.includes("content_quality_risk")) actions.push("复核最近章节/NPC/validator 事件，定位内容卡点或规则冲突。");
  if (actions.length === 0 && journey.status === "no_events") actions.push("暂无行为样本；先确认埋点身份是否写入 actorId/guestId。");
  if (actions.length === 0) actions.push("暂未发现明显风险；保持观察即可。");
  return actions.slice(0, 6);
}

export function buildAdminUserDetailSignals(input: AdminUserDetailSignalsInput): {
  journeyStage: AdminUserJourneyStage;
  riskTags: AdminUserRiskTag[];
  suggestedOpsActions: string[];
} {
  const journeyStage = deriveAdminUserJourneyStage(input.recentEvents ?? []);
  const riskTags = buildAdminUserRiskTags(input);
  return {
    journeyStage,
    riskTags,
    suggestedOpsActions: buildAdminUserSuggestedOpsActions(riskTags, journeyStage),
  };
}

export const DEFAULT_VERSECRAFT_STYLE_PROFILE_ID = "doomsday_dragonlike_suspense_v1" as const;

export type VerseCraftStyleProfile = {
  style_profile_id: typeof DEFAULT_VERSECRAFT_STYLE_PROFILE_ID;
  tone: string[];
  pov: string;
  sentence_rhythm: string[];
  dialogue_policy: string[];
  imagery_bank: string[];
  pacing_policy: string[];
  ending_policy: string[];
  forbidden_registers: string[];
  forbidden_phrases: string[];
  positive_constraints: string[];
  negative_constraints: string[];
};

const DEFAULT_PROFILE: VerseCraftStyleProfile = {
  style_profile_id: DEFAULT_VERSECRAFT_STYLE_PROFILE_ID,
  tone: [
    "冷峻悬疑",
    "规则游戏压迫感",
    "少年宿命感",
    "克制而不煽情",
  ],
  pov: "第一人称沉浸式叙事；引号外不使用第二人称旁白，不把玩家动作复述成系统说明。",
  sentence_rhythm: [
    "短句与中句交错",
    "动作、感官、反应轮换推进",
    "避免连续等长句和说明书式长段",
  ],
  dialogue_policy: [
    "对白短而有遮掩，允许停顿、回避和半句",
    "NPC 只能说自己能知道的事，不替世界观做完整讲解",
    "对白之后必须有动作或环境回响落地",
  ],
  imagery_bank: [
    "门缝",
    "冷光",
    "旧登记册",
    "潮湿墙面",
    "生锈门牌",
    "楼道回声",
    "灰尘",
    "夜色",
  ],
  pacing_policy: [
    "后果先行，再补动作细节",
    "调查回合给可验证异常，不直接给真相",
    "战斗回合先写代价和阻力，再写结果",
  ],
  ending_policy: [
    "段尾保留新疑点、未答复、危险逼近或下一步压力",
    "narrative_only 不把回合收成彻底安全或彻底解释完毕",
    "关键 reveal 只打开一条缝，不一次性讲完根因",
  ],
  forbidden_registers: [
    "系统播报腔",
    "AI解释腔",
    "爽文腔",
    "总结腔",
    "客服提示腔",
    "任务面板腔",
  ],
  forbidden_phrases: [
    "系统提示",
    "系统判定",
    "任务已完成",
    "你获得了",
    "玩家输入",
    "用户输入",
    "作为AI",
    "根据规则",
    "综上所述",
    "恭喜",
    "奖励已发放",
    "任务目标",
  ],
  positive_constraints: [
    "把规则压力写成场景里的代价和选择",
    "用少量锋利意象承载恐惧，不堆砌辞藻",
    "NPC 真实感来自欲望、回避和知识边界",
    "章节钩子来自未解事实和下一步行动压力",
  ],
  negative_constraints: [
    "不得引用或改写任何现成小说原文",
    "不得用模板冒充叙事正文",
    "不得让 NPC 凭空知道根因、关系或地点",
    "不得把 narrative 写成系统说明、战报或总结",
  ],
};

export function getVerseCraftStyleProfile(
  profileId: string | null | undefined = DEFAULT_VERSECRAFT_STYLE_PROFILE_ID
): VerseCraftStyleProfile {
  if (!profileId || profileId === DEFAULT_VERSECRAFT_STYLE_PROFILE_ID) {
    return DEFAULT_PROFILE;
  }
  return DEFAULT_PROFILE;
}

export const DEFAULT_VERSECRAFT_STYLE_PROFILE_ID = "youth_campus_suspense_v2" as const;

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
    "青春校园感",
    "少年视角的命运感",
    "日常被轻轻推歪",
    "克制但有锋利笑意",
  ],
  pov: "第一人称沉浸式叙事；引号外不使用第二人称旁白，不把玩家动作复述成系统说明。",
  sentence_rhythm: [
    "短句和中句交错，保留少年人反应里的迟疑、嘴硬和自嘲",
    "动作、感官、对白和环境反馈轮换推进",
    "避免规则条款式长段和说明书式铺陈",
  ],
  dialogue_policy: [
    "对白短而有遮掩，允许停顿、回避、玩笑和半句",
    "NPC 只能说自己能知道的事，不替世界观做完整讲解",
    "对白之后必须有动作、神情或环境回响落地",
  ],
  imagery_bank: [
    "教室黑板",
    "粉笔灰",
    "走廊灯",
    "校服袖口",
    "下课铃",
    "雨水",
    "旧登记册",
    "电梯门",
    "门缝",
    "楼道回声",
  ],
  pacing_policy: [
    "先写我当下的反应，再写异常如何挤进日常",
    "调查回合给可验证的线索或人物反应，不直接给真相",
    "危机回合先写身体代价、距离变化和选择窗口，再写结果",
  ],
  ending_policy: [
    "段尾保留新疑点、未答复、下一步压力或人物态度变化",
    "narrative_only 不把回合收成彻底安全或解释完毕",
    "关键 reveal 只打开一条缝，不一次性讲完根因",
  ],
  forbidden_registers: [
    "系统播报腔",
    "AI解释腔",
    "爽文腔",
    "总结腔",
    "客服提示腔",
    "任务面板腔",
    "规则怪谈守则腔",
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
    "守则第一条",
    "违反规则",
    "公寓规则写着",
  ],
  positive_constraints: [
    "让固定开场的教室感、少年口吻和突然坠入感继续影响后续正文",
    "把异常写成日常错位后的压力，不把规则条款当主叙事",
    "NPC 真实感来自欲望、回避、嘴硬、误会和知识边界",
    "章节钩子来自未解事实、人物态度和下一步行动压力",
  ],
  negative_constraints: [
    "不得引用或改写任何现成小说原文",
    "不得在 prompt、叙事或测试样例里点名现实作品作为仿写对象",
    "不得用模板冒充叙事正文",
    "不得让 NPC 凭空知道根因、关系或地点",
    "不得把 narrative 写成系统说明、战报或总结",
  ],
};

export function getVerseCraftStyleProfile(
  profileId: string | null | undefined = DEFAULT_VERSECRAFT_STYLE_PROFILE_ID
): VerseCraftStyleProfile {
  void profileId;
  return DEFAULT_PROFILE;
}

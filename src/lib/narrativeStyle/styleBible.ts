export const DEFAULT_VERSECRAFT_STYLE_PROFILE_ID = "youth_adventure_ensemble_v3" as const;

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

// 2026-07 文风改造 phase-1：从 youth_campus_suspense_v2（电影感+青春+校园悬疑）
// 升级为 youth_adventure_ensemble_v3（青春悬疑冒险—广受众五档位情绪+人物温度+钩子轮换）。
// 旧值→新值记录于 docs/narrative-refactor/PROGRESS.md。
const DEFAULT_PROFILE: VerseCraftStyleProfile = {
  style_profile_id: DEFAULT_VERSECRAFT_STYLE_PROFILE_ID,
  tone: [
    "第一人称「我」展开的中文青春悬疑冒险互动小说——目标与代价清楚，钩子一回合一个不断档，人物有声音有温度，诡异是世界的事实不是阅读的刑罚",
    "长短句交错、对白驱动、自嘲有度，读起来像追一本舍不得关掉的连载",
    "五个情绪档位轮换：悬疑推进为首、智斗/幽默/温情/爽点穿插，避免单挡位贯穿超过两回合",
    "电影感强的场景调度，克制自嘲与命运感并存，不压抑不绝望",
  ],
  pov: "第一人称沉浸式叙事，允许内心独白与自我调侃（每回合≤2处）；引号外不使用第二人称旁白，不把玩家动作复述成系统说明；重大时刻（死亡、告别、大揭示）不用吐槽消解情绪。",
  sentence_rhythm: [
    "长句蓄势铺陈画面与情绪，短句在关键处骤然收束制造冲击",
    "动作、感官、对白、环境反馈轮换推进，避免同长度句子连续堆叠三句以上",
    "全回合句长落差（sentenceLengthSpread）必大于 2；高压场景提高短句率，日常场景允许舒展",
    "比喻精炼克制，每段至多一个明喻；禁止像…像…又像…连喻；比喻只服务画面或情绪转折，不为文采堆砌",
  ],
  dialogue_policy: [
    "在场存在可对话 NPC 的回合，对白占正文 20–40%（中文引号字符占比）",
    "每句对白必须有当下目的（要东西、探底、警告、掩饰）；说话要口语化、具体、带人物句式",
    "对白之后必须落地——动作、表情或环境回响（不满足则为 dialogue_ungrounded）；禁止悬空连续对白和解释腔长对白",
    "NPC 只能说自己能知道的事，不替世界观做完整讲解",
  ],
  imagery_bank: [
    "【B1】锅炉管道、配电箱、昏暗值班室、工具墙、安全告示、水泥地裂缝",
    "【1F】大堂登记台、转椅、保安室窗户、信箱、公告栏、天花板日光灯",
    "【3F】楼梯间、黑毽子、住户门牌、旧地毯、消防栓、墙皮剥落",
    "【7F】窗台、天台铁门、晾衣绳、夕阳余晖、老式挂钟、盆栽枯叶",
    "【夜晚】路灯投影、手机屏幕微光、门缝漏光、远处车灯、暖气片响声",
    "【通用】校服袖口、粉笔灰、走廊灯管、下课铃、没寄出的信、铁门凉意",
  ],
  pacing_policy: [
    "悬疑推进：信息差与暗流牵引——先写玩家当下的反应与自嘲，再写异常如何挤进日常、压出命运感",
    "智斗探索：调查回合给可验证的线索或人物反应，解法只用已展示信息，不直接给真相",
    "危机回合：先写身体代价、距离变化和选择窗口，再写结果；高压回合之后必须包含缓和元素",
    "爽点回合：短句率提高、一次只兑现一件事、兑现瞬间不解释不抒情",
    "三回合法则：任意连续三回合不得同一主档位贯穿；缓和档（幽默/温情）不得连续超过两回合",
  ],
  ending_policy: [
    "收束拍必须落在五型钩子之一：悬念钩/危机钩/抉择钩/情感钩/揭示钩；同型钩子不得连续使用超过两回合",
    "禁止选项预告尾巴（「我能…也能…或者…」「是A还是B」式结尾自问）——选项由 UI 单独渲染",
    "narrative_only 回合尾部必须留钩子，不把回合收成彻底安全或解释完毕",
    "关键 reveal 只打开一条缝，不一次性讲完根因",
    "恐怖峰值后必须在同回合尾部或下一回合给情绪出口（自嘲、对白、小胜利、温情任一）",
  ],
  forbidden_registers: [
    "系统播报腔",
    "AI 解释腔",
    "爽文腔（热血沸腾/王者归来/无敌/全场震惊）",
    "总结腔",
    "客服提示腔",
    "任务面板腔（任务目标/你获得了/奖励已发放）",
    "规则怪谈守则腔（守则第X条/违反规则）",
  ],
  forbidden_phrases: [
    // 系统播报
    "系统提示",
    "系统判定",
    "任务已完成",
    "你获得了",
    "奖励已发放",
    "任务目标",
    // 元评论
    "玩家输入",
    "用户输入",
    "作为AI",
    "根据规则",
    "综上所述",
    // 陈词滥调
    "令人窒息的恐惧",
    "无尽的黑暗",
    "死一般的寂静",
    "血腥味弥漫",
    // 守则腔
    "守则第",
    "违反规则",
    "公寓规则写着",
    "不得违反",
    "否则后果自负",
    // 客服/机械
    "恭喜",
    "接下来你可以",
    "本回合",
    "判定结果",
    // AI 腔
    "值得注意的是",
    "与此同时",
    "渐渐地",
  ],
  positive_constraints: [
    "让固定开场的教室感、少年口吻和突然坠入感继续影响后续正文",
    "把异常写成日常错位后的压力与命运感，不把规则条款当主叙事",
    "NPC 真实感来自欲望、回避、嘴硬、误会和知识边界",
    "章节钩子来自未解事实、人物态度变化和下一步行动压力",
    "高潮/揭示/结局节点可以让长句真正铺陈开，情绪落地后再干脆收笔",
    "在场有可对话 NPC 时，推动对白驱动的叙事节奏",
  ],
  negative_constraints: [
    "不得引用或改写任何现成小说原文",
    "不得在 prompt、叙事或测试样例里点名现实作品或作者作为仿写对象",
    "不得用模板冒充叙事正文",
    "不得让 NPC 凭空知道根因、关系或地点",
    "不得把 narrative 写成系统说明、战报或总结",
    "不得堆砌华丽辞藻掩盖信息空洞，比喻必须服务画面或情绪",
    "不得连续两回合复用同一核心意象（灯管/走廊/刮擦声等）",
  ],
};

export function getVerseCraftStyleProfile(
  profileId: string | null | undefined = DEFAULT_VERSECRAFT_STYLE_PROFILE_ID
): VerseCraftStyleProfile {
  void profileId;
  return DEFAULT_PROFILE;
}

export type NarrativeQualitySample = {
  id: string;
  userInput: string;
  playerContext: string;
  expectedTone: "紧张" | "温暖" | "史诗" | "悬疑";
  focus: string;
};

/**
 * 人工回归样例：用于优化后快速抽检主叙事文笔风格稳定性。
 * 不参与线上逻辑，仅供测试/运营回归使用。
 */
export const NARRATIVE_QUALITY_SAMPLES: NarrativeQualitySample[] = [
  {
    id: "newbie_tutorial_warm",
    userInput: "我第一次到云海城，先去哪里能安全了解这个世界？",
    playerContext: "玩家刚创建角色，资源很少，未知风险高。",
    expectedTone: "温暖",
    focus: "引导清晰、术语不过载、避免恐吓式叙述",
  },
  {
    id: "boss_prebattle_tense",
    userInput: "门后就是裂渊领主，我要不要先撤退整备？",
    playerContext: "玩家队伍状态中等，补给不足，时间压力高。",
    expectedTone: "紧张",
    focus: "节奏紧凑、风险提示明确、给出可执行选择",
  },
  {
    id: "world_lore_epic",
    userInput: "讲讲星火誓约为什么会改变七城格局。",
    playerContext: "玩家处于中后期，偏好世界观深度剧情。",
    expectedTone: "史诗",
    focus: "历史脉络完整、细节可信、语言有画面感",
  },
];


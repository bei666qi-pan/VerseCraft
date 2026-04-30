export type GameGuideSection = {
  id: string;
  index: string;
  title: string;
  body: string;
};

export const GAME_GUIDE_SECTIONS: readonly GameGuideSection[] = [
  {
    id: "what-is-it",
    index: "01",
    title: "游戏是什么",
    body: "《VerseCraft》是 AI 驱动的悬疑互动小说。你不是只读固定剧情，而是输入自然语言行动，由系统结合场景、状态、时间与线索判断后果。",
  },
  {
    id: "objective",
    index: "02",
    title: "你的目标",
    body: "当前世界为“序章·暗月”。你需要在异常公寓中活下来，验证传闻与残页，收集线索，处理人物关系，并接近真正出口。",
  },
  {
    id: "how-to-act",
    index: "03",
    title: "如何行动",
    body: "每轮可选择系统选项，也可手动输入。行动要写清楚对象、方式和退路。例如：我不立刻开门，先贴近门边听里面有没有动静。",
  },
  {
    id: "not-wishing",
    index: "04",
    title: "行动不是许愿",
    body: "游戏会理解你的意图，但不会无条件满足结果。不要直接输入“通关”或“告诉我真相”，应通过观察、询问、验证和物证推进。",
  },
  {
    id: "stats-originium",
    index: "05",
    title: "属性与原石",
    body: "精神影响承压，敏捷影响反应，幸运影响提示，魅力影响对话，账本信用影响初始登记额度。原石是楼内秩序货币，建议留给关键服务或撤退窗口。",
  },
  {
    id: "time-talent",
    index: "06",
    title: "时间与天赋",
    body: "多数有效行动都会推动时间。时间会影响安全程度、人物位置、事件触发与天赋冷却。回响天赋适合在高风险或路线不明时使用。",
  },
] as const;

// src/lib/ai/tools/mechanicsIntentClassifier/seedPhrases/darkMoon.ts
//
// 暗月（序章·暗月）Mechanics Workflow mechanics 意图种子短语清单。
// 严格只包含通用 mechanics 动作与该世界观内可执行操作（锻造/任务/战斗/物品/调查/
//  移动等），**绝不出现任何世界专属 NPC 名 / 物品名 / 地名**——以避免 §2.4 跨世界
//  幻觉污染 embedding 空间。这些短语由 scripts/buildDmIntentEmbeddings.ts 在 build
//  time 调 embedText() 一次性向量化并写入 ../embeddings/darkMoonMechanics.ts。
//
//  与 mechanicsIntentRouter.ts 的 STRONG_MECHANICS_SIGNALS 列表保持同义集合；
//  此处多收 5-10 条更口语化的"动作意图"短语以弥补 keyword 分类器对自然语言变体的漏报。

export const DARK_MOON_MECHANICS_SEED_PHRASES: readonly string[] = [
  // 锻造 / 制作
  "我要锻造武器",
  "打造装备",
  "铸剑",
  "锻一把刀",
  "强化武器",
  "改装武器",
  "修理武器",
  // 任务
  "接一个任务",
  "领任务",
  "完成任务",
  "提交任务",
  "接受委托",
  // 战斗
  "攻击敌人",
  "开战",
  "应战",
  "迎战",
  "反击",
  "格挡",
  "闪避",
  // 物品 / 材料
  "消耗材料",
  "使用物品",
  "装备武器",
  "卸下武器",
  "拾取物品",
  "丢弃物品",
  "检查背包",
  // 探索 / 调查
  "调查房间",
  "搜索线索",
  "打开门",
  "进入下个房间",
  "查看地图",
];

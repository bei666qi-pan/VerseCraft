// src/lib/ai/tools/mechanicsIntentClassifier/seedPhrases/xingni.ts
//
// 星逆·太初 Mechanics Workflow mechanics 意图种子短语清单。
// 严格只包含修仙世界观内通用 mechanics 动作（灵石/法器/炼器/炼丹/突破/任务/战斗/
//  移动/调查等），**绝不出现任何专属 NPC 名（白葵/苏木/陈砚等）、物品名（暗月"陈砚"
//  /公寓楼层号）、地名（如月公寓/B1_SafeZone）**——以避免 §2.4 跨世界幻觉污染
//  embedding 空间。这些短语由 scripts/buildDmIntentEmbeddings.ts 在 build time 调
//  embedText() 一次性向量化并写入 ../embeddings/xingniMechanics.ts。
//
//  与 mechanicsIntentRouter.ts 的 STRONG_MECHANICS_SIGNALS 相比，本表补充了星逆
//  特有的修真工艺词（灵石/法器/符箓/阵法/御剑/突破/渡劫/炼丹/炼器 等）——这些词在
//  keyword 分类器里目前 0 命中，是 embedding 路径的主要价值。

export const XINGNI_MECHANICS_SEED_PHRASES: readonly string[] = [
  // 灵石 / 货币
  "花费灵石购买物品",
  "消耗灵石",
  "支付灵石",
  "用灵石换材料",
  // 法器 / 武器
  "锻造法器",
  "炼制法剑",
  "强化法器",
  "祭炼本命飞剑",
  "修补法器",
  // 炼丹 / 炼器 / 阵法
  "炼丹",
  "炼器",
  "开炉炼丹",
  "画符箓",
  "布置阵法",
  "破解阵法",
  // 御剑 / 飞行
  "御剑飞行",
  "御剑起落",
  "御剑离开",
  // 修为 / 突破
  "突破筑基",
  "突破境界",
  "结丹",
  "尝试渡劫",
  "闭关修炼",
  "运转功法",
  // 任务 / 委托
  "接宗派任务",
  "接受委托",
  "完成任务",
  "提交任务",
  // 战斗
  "出手攻击",
  "应战",
  "迎战妖兽",
  "格挡",
  "闪避",
  // 物品 / 背包
  "检查储物袋",
  "使用丹药",
  "服用回气丹",
  "装备法器",
  // 探索 / 移动
  "赶路前往",
  "离开当前位置",
  "进入客栈",
  "探查周围",
  "询问消息",
];

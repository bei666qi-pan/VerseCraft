/**
 * NPC 人格卡类型定义
 *
 * 每个主要 NPC 持有一张结构化的 Persona Card，在 prompt assembly 阶段注入，
 * 为 AI DM 提供该 NPC 的说话方式、行为模式、知识边界和动机约束。
 *
 * 设计原则：
 * - 补充（而非替换）现有 npcHeart / epistemic / multiNpcPersona 系统
 * - 字段精简、信息密度高，每个卡约 200-400 字
 * - Big 5 人格维度只保留"最高+最低"两个极值（降噪）
 */

/** Big 5 人格维度的精简表示（仅保留极值） */
export interface NpcBig5Digest {
  /** 开放性 1-10：高=好奇/想象力丰富，低=务实/保守 */
  openness: number;
  /** 尽责性 1-10：高=自律/可靠，低=随性/散漫 */
  conscientiousness: number;
  /** 外向性 1-10：高=健谈/主动，低=内向/沉默 */
  extraversion: number;
  /** 宜人性 1-10：高=合作/信任，低=怀疑/对抗 */
  agreeableness: number;
  /** 神经质 1-10：高=焦虑/警觉，低=稳定/淡定 */
  neuroticism: number;
}

export interface NpcPersonaCard {
  /** NPC 唯一标识符（N-xxx 格式） */
  npcId: string;
  /** 显示名称 */
  displayName: string;
  /** Big 5 人格精简摘要 */
  big5: NpcBig5Digest;
  /** 说话方式特征（3-5 条简短规则） */
  voiceRules: string[];
  /** NPC 明确知道的事实（fact IDs 或自然语言描述） */
  knownFacts: string[];
  /** NPC 明确不知道或不应透露的事实 */
  unknownFacts: string[];
  /** 当前核心动机 / 想要的东西 */
  currentGoal: string;
  /** 恐惧 / 避讳 / 不会主动提及的话题 */
  fears: string[];
  /** 与玩家的关系基调（1 句话） */
  playerRelationship: string;
  /** 与其他关键 NPC 的关系（可选，用于互动场景） */
  npcRelationships?: Record<string, string>;
  /** 对危机/异常的标准反应模式 */
  crisisBehavior: string;
  /** 不宜做的事（硬性约束，类似 taboo） */
  hardConstraints: string[];
}

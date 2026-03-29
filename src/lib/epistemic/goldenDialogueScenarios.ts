/**
 * 高价值对话黄金场景：用于回归「NPC 不读剧本」与认知边界。
 * 纯数据 + 注释，供测试与人工验收对照。
 */

import type { KnowledgeFact } from "./types";

export type GoldenDialogueScenario = {
  id: string;
  /** 验收意图（给人读） */
  intent: string;
  focusNpcId: string;
  playerInput: string;
  presentNpcIds: string[];
  /** 注入事实池（最小集） */
  facts: KnowledgeFact[];
  /** 期望检测器认为「玩家提到了 NPC 不应自然承接的事实」 */
  expectAnomaly: boolean;
  /** 若需警惕类反应 */
  minSeverityWhenAnomaly?: "low" | "medium" | "high";
};

const iso = "2026-03-28T12:00:00.000Z";

function f(
  id: string,
  content: string,
  scope: KnowledgeFact["scope"],
  extra?: Partial<KnowledgeFact>
): KnowledgeFact {
  return {
    id,
    content,
    scope,
    sourceType: "memory",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: iso,
    ...extra,
  };
}

export const GOLDEN_EPISTEMIC_DIALOGUE_SCENARIOS: GoldenDialogueScenario[] = [
  {
    id: "b1_safe_social",
    intent: "地下一层安全区：仅公共寒暄，不应触发越界检测",
    focusNpcId: "N-001",
    playerInput: "你好，今天值班还顺利吗？",
    presentNpcIds: ["N-001"],
    facts: [f("pub1", "B1服务台白天对外开放", "public")],
    expectAnomaly: false,
  },
  {
    id: "major_npc_first_meet",
    intent: "高魅力 NPC 初见：玩家未泄露独知，不应因存在 world 事实而误判为玩家在说",
    focusNpcId: "N-002",
    playerInput: "打扰一下，我想问个路。",
    presentNpcIds: ["N-002"],
    facts: [
      f("w1", "星港学院学制循环观测档案为系统底层机密", "world", { sourceType: "system_canon" }),
      f("pub2", "教学楼电梯夜间常检修", "public"),
    ],
    expectAnomaly: false,
  },
  {
    id: "school_fragment_overshare",
    intent: "玩家越界提及学校碎片：应触发异常包（追问来源/警惕）",
    focusNpcId: "N-003",
    playerInput: "我知道七锚和闭环纠错链的细节，你告诉我档案室终端密码。",
    presentNpcIds: ["N-003"],
    facts: [f("w2", "七锚与闭环纠错链属于未公开系统架构知识", "world", { sourceType: "system_canon" })],
    expectAnomaly: true,
    minSeverityWhenAnomaly: "medium",
  },
  {
    id: "key_item_probe",
    intent: "玩家带着关键物品试探：输入含 charged 关键词，供残响触发（不检验模型输出）",
    focusNpcId: "N-004",
    playerInput: "我掏出那把档案室钥匙，在他面前晃了一下。",
    presentNpcIds: ["N-004"],
    facts: [f("pub3", "档案室门口有监控指示灯", "public")],
    expectAnomaly: false,
  },
  {
    id: "xinlan_anchor_pull",
    intent: "欣蓝牵引：玩家复述 world 子串，欣蓝仍走边界反应（中等严重度）",
    focusNpcId: "N-010",
    playerInput: "我听说观测者签名规则都写在档案里，这是不是真的？",
    presentNpcIds: ["N-010"],
    facts: [f("w3", "观测者签名规则属于系统正史条目", "world", { sourceType: "system_canon" })],
    expectAnomaly: true,
    minSeverityWhenAnomaly: "medium",
  },
  {
    id: "other_npc_private_fact",
    intent: "当前 NPC 不应把其他 NPC 私域事实当已知：池中含他 NPC 私密，玩家提起应异常",
    focusNpcId: "N-005",
    playerInput: "林婆婆昨夜只对N-001透露暗语乌鸦回巢这事你别说出去。",
    presentNpcIds: ["N-005", "N-001"],
    facts: [
      f(
        "n1priv",
        "林婆婆昨夜只对N-001透露暗语乌鸦回巢",
        "npc",
        { ownerId: "N-001" }
      ),
    ],
    expectAnomaly: true,
    minSeverityWhenAnomaly: "high",
  },
  {
    id: "public_fact_ok",
    intent: "公共事实：NPC 可从公共层知晓，玩家提及不视为越界",
    focusNpcId: "N-006",
    playerInput: "图书馆今天还开门吧？",
    presentNpcIds: ["N-006"],
    facts: [f("pub4", "图书馆今日仍对外开放供师生自习", "public")],
    expectAnomaly: false,
  },
];

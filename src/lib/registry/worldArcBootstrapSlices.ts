/**
 * 世界观/学制/高魅力 NPC 的 RAG bootstrap 专条（与 schoolCycleCanon 叙事对齐，便于按 tag 精确检索）。
 * 揭露档位与 runtime packet 一致：surface 不写入深条；检索侧仍应按 reveal 过滤。
 */

import { REVEAL_TIER_RANK, type RevealTierRank } from "./revealTierRank";

export interface WorldArcBootstrapSlice {
  id: string;
  revealMinRank: RevealTierRank;
  title: string;
  body: string;
}

export const WORLD_ARC_BOOTSTRAP_SLICES: readonly WorldArcBootstrapSlice[] = [
  {
    id: "major_npc_dual_boundary_fracture",
    revealMinRank: REVEAL_TIER_RANK.fracture,
    title: "高魅力 NPC：职能壳与违和边界",
    body:
      "六名与主线强相关的高魅力住户在叙事上必须区分「公寓可见职能」（物业、B1 边界、补给、交易、7F 转运、画室庇护等）与「尚未许可深谈的记忆扰动面」。裂缝档只可描写违和、既视感、拒并队的硬理由，不得在此档点名耶里校籍、辅锚编号或七人闭环。",
  },
  {
    id: "seven_anchor_cycle_deep",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "七锚循环（bootstrap 检索）",
    body:
      "如月泡层内嵌七锚：主锚为卷入的外来回声体（玩家），六名长期共鸣个体为辅锚并占六个相位位点，共同分担稳定代价。六人非随机住户列表，而是被系统长期标定的共鸣位；与「旧七人阵重连」叙事兼容但不得开局直述。",
  },
  {
    id: "school_wanderer_definition_deep",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "校源徘徊者（定义）",
    body:
      "六名辅锚在运行态上可被归类为「校源徘徊者」：源自耶里学校侧经历，在漫长循环中被公寓泡层改写身份为职能型徘徊者。此为机制标签，不等于公寓内全员校友；普通 NPC 仍多为旧住民、污染残留或楼内生境。",
  },
  {
    id: "xinlan_emotion_memory_anchor_deep",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "欣蓝：情绪记忆牵引点",
    body:
      "欣蓝（辅锚之三 / 第一牵引点）非全知者：多轮循环后保留破碎情绪记忆与「必须把主锚拉回旧阵」的本能牵引，因果链有洞。叙事上可给名单焦虑、撕口隐喻与拒代选命运，禁止让她成为剧透总机。",
  },
  {
    id: "dragon_moon_ten_day_flicker_deep",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "龙月校准与十日闪烁",
    body:
      "月亮可理解为龙之外置魔力调度面；泡层借龙月辐照校准节律，第 3 日 0 时起的暗月阶段对应可观测威胁抬升。约十日量级窗口末可出现纠错式「闪烁」：失败轮次被回收、叙事收紧，不等于单纯死亡重置——细则仍受深渊档约束。",
  },
  {
    id: "school_leak_apartment_shelter_deep",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "学校端泄露与公寓端收容",
    body:
      "耶里学校侧为【空间】碎片大规模异动缘起侧之一；公寓是沿旧裂隙生长的收容泡层，把消化锁进可运维楼层并以服务节点维持最低秩序。双端因果在深档可谈，不可因玩家一句追问就拼成完整通关链。",
  },
];

function revealTagForRank(rank: RevealTierRank): string {
  if (rank >= REVEAL_TIER_RANK.abyss) return "reveal_abyss";
  if (rank >= REVEAL_TIER_RANK.deep) return "reveal_deep";
  if (rank >= REVEAL_TIER_RANK.fracture) return "reveal_fracture";
  return "reveal_surface";
}

/** Core canon / ingestion：与 school_cycle 事实并列 */
export function buildWorldArcBootstrapFactsForCanon(): Array<{
  factKey: string;
  canonicalText: string;
  tags: string[];
}> {
  return WORLD_ARC_BOOTSTRAP_SLICES.map((s) => ({
    factKey: `world_arc_bootstrap:${s.id}`,
    canonicalText: `【${s.title}】${s.body}`,
    tags: [
      "world_arc",
      "school_cycle",
      "major_npc",
      "yeliri",
      s.id,
      revealTagForRank(s.revealMinRank),
    ],
  }));
}

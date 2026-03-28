/**
 * 学制循环 / 七锚收容 / 校源徘徊者 — 结构化世界观层。
 * - 供 RAG（coreCanonMapping）、bootstrap（registryAdapters）、runtime packet 按 reveal 档位裁剪注入。
 * - 不在此文件堆长文；细则见 docs/worldview-school-cycle-canon.md
 */

import { REVEAL_TIER_RANK, type RevealTierRank } from "./revealTierRank";
import { SCHOOL_CYCLE_RESONANCE_NPC_IDS } from "./schoolCycleIds";

export { SCHOOL_CYCLE_RESONANCE_NPC_IDS } from "./schoolCycleIds";

export interface SchoolCycleLoreSlice {
  id: string;
  /** 允许注入的最低揭露档位（含本档及以上可见） */
  revealMinRank: RevealTierRank;
  title: string;
  body: string;
}

/** 分层叙事切片：由 `revealMinRank` 控制开局不剧透 */
export const SCHOOL_CYCLE_LORE_SLICES: readonly SchoolCycleLoreSlice[] = [
  {
    id: "rumor_yeliri_echo",
    revealMinRank: REVEAL_TIER_RANK.surface,
    title: "邻校传言",
    body:
      "住户闲聊里偶尔提到邻校「耶里」：那边曾出过「整栋楼像被拧进另一层空间」的怪谈；如月公寓则被说成「折进时间褶皱里的另一栋」。真相未证，仅作传言。",
  },
  {
    id: "not_ordinary_wanderer_coupling",
    revealMinRank: REVEAL_TIER_RANK.fracture,
    title: "非普通徘徊者耦合",
    body:
      "数名与关键服务节点强绑定的住户，其反应节律更像被楼「认可」的长期职能节点，而非临时登记人口或普通污染残留。可描写违和与既视感，但不要在此档点名「辅锚」「校籍」或七人闭环。",
  },
  {
    id: "school_leak_apartment_shell",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "泄露与收容壳层",
    body:
      "耶里学校是【空间】权柄碎片初次大规模异动的缘起侧之一；如月公寓并非同一灾变的「第一现场」，而是沿旧裂隙生长出的收容泡层：把消化过程锁在可运维的楼层结构里，并以规则与服务节点维持最低秩序。",
  },
  {
    id: "seven_anchor_loop",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "七锚分担",
    body:
      "泡层内嵌固定七锚结构：主锚为被卷入的外来回声体（玩家）；六名长期共鸣个体为辅锚，对应六个相位位点，共同分担稳定代价。此六人并非随机住户列表，而是系统长期标定的共鸣位。",
  },
  {
    id: "ten_day_recycle_narrative",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "十日纠错",
    body:
      "约十日量级的循环窗口末尾，泡层会出现「闪烁」式纠错：失败轮次被回收、叙事线被收紧，不等同于单纯死亡叙事。系统借此清掉不可收敛分支，并把主锚回写到最近稳定拓扑。",
  },
  {
    id: "dragon_moon_calibration",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "龙月校准",
    body:
      "月亮在此世界观下可理解为龙之外置魔力调度面。公寓借龙月辐照校准泡层节律；游戏内第3日0时起的暗月阶段对应校准相位偏移，威胁整体抬升是「节律收紧」的可观测后果。",
  },
  {
    id: "protagonist_echo_traits",
    revealMinRank: REVEAL_TIER_RANK.fracture,
    title: "主锚特性",
    body:
      "主锚（玩家回声体）不是典型战力英雄模板：强在难以被循环彻底抛弃、可保留碎片化记忆、对空间褶皱与边界噪声异常敏感。原石与装备不能合法叙事成「一键龙傲天」；战力成长须服从服务端裁决与资源闭环。",
  },
  {
    id: "originium_closure",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "原石闭环",
    body:
      "不存在天然原石矿脉。原石主要为泡层空间壁短时析出的稳定能结晶，并叠加夜读老人（N-011）等秩序节点的再分配。用途侧重：维持他者稳定、交易媒介、修复与秩序分配，而非无限强化单一个体。",
  },
  {
    id: "school_wanderer_state",
    revealMinRank: REVEAL_TIER_RANK.deep,
    title: "校源徘徊者",
    body:
      "六名共鸣辅锚原为耶里学校学生；在漫长循环中被公寓系统归类为「校源徘徊者」——这是运行态标签，不是普通出身设定。其余公寓 NPC 仍多为旧住民、污染残留或楼内生境，不得默认全员校友。",
  },
  {
    id: "abyss_alignment",
    revealMinRank: REVEAL_TIER_RANK.abyss,
    title: "出口对账",
    body:
      "B2 喉管与 A-008 守门是泡层对「可离开样本」的终筛。离开叙事必须与守门规则、钥匙与暗号链路对齐；七锚代价是否在出口结算中一次性对账，仅允许在深渊档逐步对齐，禁止开局直述通关步骤。",
  },
];

function revealTagForRank(rank: RevealTierRank): string {
  if (rank >= REVEAL_TIER_RANK.abyss) return "reveal_abyss";
  if (rank >= REVEAL_TIER_RANK.deep) return "reveal_deep";
  if (rank >= REVEAL_TIER_RANK.fracture) return "reveal_fracture";
  return "reveal_surface";
}

/** RAG / coreCanon：逐条事实（带揭露标签） */
export function buildSchoolCycleLoreFactsForCanon(): Array<{
  factKey: string;
  canonicalText: string;
  tags: string[];
}> {
  return SCHOOL_CYCLE_LORE_SLICES.map((s) => ({
    factKey: `school_cycle:${s.id}`,
    canonicalText: `【${s.title}】${s.body}`,
    tags: ["school_cycle", "yeliri", s.id, revealTagForRank(s.revealMinRank)],
  }));
}

export interface SchoolCycleArcPacket {
  schema: "school_cycle_arc_v1";
  maxRevealRankInjected: RevealTierRank;
  resonanceNpcIds: readonly string[];
  primaryAnchor: "player_echo";
  slices: Array<{ id: string; title: string; hint: string }>;
}

/** Runtime JSON：按当前回合允许档位注入，避免超长 */
export function buildSchoolCycleArcPacket(maxRevealRank: RevealTierRank): SchoolCycleArcPacket {
  const slices = SCHOOL_CYCLE_LORE_SLICES.filter((s) => s.revealMinRank <= maxRevealRank).map((s) => ({
    id: s.id,
    title: s.title,
    hint: s.body.length > 160 ? `${s.body.slice(0, 157)}…` : s.body,
  }));
  return {
    schema: "school_cycle_arc_v1",
    maxRevealRankInjected: maxRevealRank,
    resonanceNpcIds: SCHOOL_CYCLE_RESONANCE_NPC_IDS,
    primaryAnchor: "player_echo",
    slices,
  };
}

export function buildSchoolCycleArcPacketCompact(maxRevealRank: RevealTierRank): SchoolCycleArcPacket {
  const full = buildSchoolCycleArcPacket(maxRevealRank);
  return {
    ...full,
    slices: full.slices.slice(-3),
  };
}

/** 超长上下文截断时用，避免挤出 weapon/forge 等硬需键 */
export function buildSchoolCycleArcPacketMicro(maxRevealRank: RevealTierRank): Pick<
  SchoolCycleArcPacket,
  "schema" | "maxRevealRankInjected" | "primaryAnchor"
> & { sliceIds: string[] } {
  const full = buildSchoolCycleArcPacket(maxRevealRank);
  return {
    schema: full.schema,
    maxRevealRankInjected: full.maxRevealRankInjected,
    primaryAnchor: full.primaryAnchor,
    sliceIds: full.slices.map((s) => s.id),
  };
}

/** 写入 `apartmentTruth` 的极短提要（非长文；细节走 packet/RAG） */
export function buildSchoolCycleRootEpigraph(): string {
  return [
    "耶里学校为【空间】碎片异动缘起侧；如月公寓为沿旧裂隙生长的七锚收容泡层（主锚＝卷入的回声体，六辅锚＝固定共鸣位）。",
    "十日量级窗口末可出现纠错式「闪烁」；龙月提供外置校准面；原石无矿脉，来自壁析与秩序再分配。",
    "完整机制分层揭露，禁止开局直述通关链。",
  ].join("");
}

/**
 * 学制/校源/七锚/重连 — 可检索 bootstrap 专条（与 runtime packet 分轨：长文与对账走 RAG，packet 只给短结构）。
 * registryAdapters / coreCanonMapping 共用；tags 含 reveal_* 供检索侧过滤。
 */

import { REVEAL_TIER_RANK, revealKnowledgeTagFromRank, type RevealTierRank } from "./revealTierRank";

export interface SchoolCycleRetrievalSeed {
  code: string;
  canonicalName: string;
  title: string;
  summary: string;
  detail: string;
  sourceRef: string;
  importance: number;
  revealMinRank: RevealTierRank;
  /** 与实体 tags 合并；须含领域标签 */
  tags: readonly string[];
}

/** 八条专类种子：学校事故、七锚、校源徘徊者、六人双层身份、欣蓝牵引、十日闪烁、龙月、旧阵重连 */
export const SCHOOL_CYCLE_RETRIEVAL_SEEDS: readonly SchoolCycleRetrievalSeed[] = [
  {
    code: "truth:pkg:incident_yeliri_school",
    canonicalName: "pkg_incident_yeliri_school",
    title: "耶里学校事故（空间碎片缘起侧）",
    summary:
      "【空间】碎片初次大规模异动与卷入叙事可追溯至耶里学校侧泄露；如月公寓泡层为沿旧裂隙生长的收容果，非同一现场复制。",
    detail:
      "对齐 rootCanon「耶里学校·碎片缘起」。runtime 不向 surface 注入；deep+ school_source_packet 可给提纲。禁止仅凭玩家口语追问一次性对齐全因果。",
    sourceRef: "registry/rootCanon.ts:yeliri_school_first_leak",
    importance: 91,
    revealMinRank: REVEAL_TIER_RANK.deep,
    tags: ["truth", "school_cycle", "yeliri", "incident", "spatial_leak"],
  },
  {
    code: "truth:pkg:seven_anchor_structure",
    canonicalName: "pkg_seven_anchor_structure",
    title: "七锚收容结构",
    summary:
      "泡层内嵌固定七锚：主锚为外来卷入的回声体；六名为长期标定共鸣辅锚，各占相位位点，共担稳定代价。",
    detail:
      "对齐 schoolCycleCanon seven_anchor_loop。须 reveal_deep+ 检索与注入；surface 禁止点名七锚与辅锚编号。",
    sourceRef: "registry/schoolCycleCanon.ts:seven_anchor_loop",
    importance: 89,
    revealMinRank: REVEAL_TIER_RANK.deep,
    tags: ["truth", "school_cycle", "seven_anchor", "containment"],
  },
  {
    code: "truth:pkg:school_wanderer_definition",
    canonicalName: "pkg_school_wanderer_definition",
    title: "校源徘徊者（运行态定义）",
    summary:
      "六名辅锚可被系统标为「校源徘徊者」：源自耶里侧经历，经漫长循环被泡层改写为职能型徘徊者；非全员校友标签。",
    detail:
      "对齐 schoolCycleCanon school_wanderer_state。与普通住户/污染残留区分；检索须 reveal_deep。",
    sourceRef: "registry/schoolCycleCanon.ts:school_wanderer_state",
    importance: 88,
    revealMinRank: REVEAL_TIER_RANK.deep,
    tags: ["truth", "school_cycle", "school_wanderer", "wanderer_state"],
  },
  {
    code: "truth:pkg:six_major_npc_dual_identity",
    canonicalName: "pkg_six_major_npc_dual_identity",
    title: "六位高魅力 NPC：公寓职能壳与校源深层",
    summary:
      "叙事上必须双层：表层为物业/B1/补给/交易/7F/画室等职能壳；deep+ 才许可辅锚相位、校源残响与 join 条件对齐。",
    detail:
      "对齐 majorNpcDeepCanon + worldArcBootstrap major_npc_dual_boundary_fracture。fracture 只给违和与既视感，不得点名「同学」「辅锚」全貌。",
    sourceRef: "registry/majorNpcDeepCanon.ts + worldArcBootstrapSlices.ts",
    importance: 87,
    revealMinRank: REVEAL_TIER_RANK.deep,
    tags: ["truth", "school_cycle", "major_npc", "dual_identity", "six_anchors_satellite"],
  },
  {
    code: "truth:pkg:xinlan_first_pivot",
    canonicalName: "pkg_xinlan_first_pivot",
    title: "欣蓝：第一牵引点（非全知）",
    summary:
      "欣蓝为辅锚之三与旧阵第一牵引点：情绪残片与「拉回旧阵」本能强，因果链有洞；禁止当剧透总机。",
    detail:
      "对齐 worldArcBootstrap xinlan_emotion_memory_anchor_deep。须 reveal_deep+；stable prompt 禁止代其倾泻七锚全貌。",
    sourceRef: "registry/worldArcBootstrapSlices.ts:xinlan_emotion_memory_anchor_deep",
    importance: 90,
    revealMinRank: REVEAL_TIER_RANK.deep,
    tags: ["truth", "school_cycle", "N-010", "xinlan", "first_pivot"],
  },
  {
    code: "truth:pkg:ten_day_flash_recycle",
    canonicalName: "pkg_ten_day_flash_recycle",
    title: "十日窗口与纠错闪烁",
    summary:
      "封闭十日量级窗口：校准→前兆→执行型闪烁→失败分支回收；非同一剧本重演。与 cycle_time_packet 数值位相同步。",
    detail:
      "对齐 cycleMoonFlashRegistry + schoolCycleCanon ten_day_recycle_narrative。deep+ 机制叙述；surface 仅邻校传言级。",
    sourceRef: "registry/cycleMoonFlashRegistry.ts",
    importance: 86,
    revealMinRank: REVEAL_TIER_RANK.deep,
    tags: ["truth", "school_cycle", "ten_day", "flash", "recycle"],
  },
  {
    code: "truth:pkg:dragon_moon_mechanism",
    canonicalName: "pkg_dragon_moon_mechanism",
    title: "龙月：外置校准与暗月相位",
    summary:
      "月亮为龙之外置魔力调度面，向泡层供能校准；第 3 日起游戏内暗月为可观测相位偏移，威胁抬升为后果而非独立 debuff。",
    detail:
      "fracture 可见节律收紧后果；deep+ 才直述龙月机制与十日链耦合。对齐 worldOrderRegistry dragon_moon_calibration。",
    sourceRef: "registry/worldOrderRegistry.ts:dragon_moon_calibration",
    importance: 85,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "school_cycle", "dragon_moon", "calibration", "dark_moon"],
  },
  {
    code: "truth:pkg:old_seven_team_relink",
    canonicalName: "pkg_old_seven_team_relink",
    title: "旧七人阵重连",
    summary:
      "重连须渐进：major_npc_relink_packet + team_relink_packet 给阶段与门闸；禁止 instant party 与单句问出全队真相。",
    detail:
      "对齐 majorNpcRelinkRegistry / partyRelinkRegistry。fracture+ 可有关系压强与阶段枚举；deep+ 才对齐校源与辅锚语义。",
    sourceRef: "registry/majorNpcRelinkRegistry.ts",
    importance: 84,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "school_cycle", "team_relink", "old_loop", "party"],
  },
] as const;

export function schoolCycleRetrievalRevealTag(rank: RevealTierRank): string {
  return revealKnowledgeTagFromRank(rank);
}

/** 写入 coreCanonMapping 的 LoreFact 行（与 bootstrap 实体双轨同内容，便于向量库） */
export function buildSchoolCycleRetrievalFactsForCanon(): Array<{
  factKey: string;
  canonicalText: string;
  tags: string[];
}> {
  return SCHOOL_CYCLE_RETRIEVAL_SEEDS.map((s) => ({
    factKey: `school_cycle_pkg:${s.code.replace("truth:pkg:", "")}`,
    canonicalText: `【${s.title}】${s.summary} ${s.detail}`,
    tags: uniqueTags([...s.tags, revealKnowledgeTagFromRank(s.revealMinRank), "bootstrap_pkg"]),
  }));
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

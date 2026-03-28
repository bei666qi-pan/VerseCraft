/**
 * 高魅力六人：支线扩写用短种子（非完整剧本）。
 * relatedQuestHook 由 `questHooksForMajorNpc` 按索引派生，避免与 npcProfiles 字符串漂移。
 */

import { REVEAL_TIER_RANK, revealKnowledgeTagFromRank, type RevealTierRank } from "./revealTierRank";
import type { MajorNpcId } from "./majorNpcDeepCanon";
import { questHooksForMajorNpc } from "./majorNpcQuestHooks";

export interface MajorNpcBranchSeed {
  code: string;
  npcId: MajorNpcId;
  /** 来自 CORE_NPC_PROFILES_V2.interaction.questHooks[profileHookIndex] */
  relatedQuestHook: string;
  canonicalName: string;
  title: string;
  summary: string;
  detail: string;
  sourceRef: string;
  importance: number;
  revealMinRank: RevealTierRank;
  tags: readonly string[];
}

type SeedTemplate = Omit<MajorNpcBranchSeed, "relatedQuestHook"> & {
  /** 默认 0；本条支线强调的 hook 在 profile 数组中的下标 */
  profileHookIndex?: number;
};

function finalizeBranchSeed(t: SeedTemplate): MajorNpcBranchSeed {
  const hooks = questHooksForMajorNpc(t.npcId);
  const idx = t.profileHookIndex ?? 0;
  const relatedQuestHook = hooks[idx];
  if (!relatedQuestHook) {
    throw new Error(`majorNpcBranchSeeds: ${t.npcId} missing questHooks[${idx}]`);
  }
  const { profileHookIndex: _idx, ...base } = t;
  return { ...base, relatedQuestHook };
}

const BRANCH_SEED_TEMPLATES: readonly SeedTemplate[] = [
  {
    code: "truth:branch:n015_border_oath",
    npcId: "N-015",
    canonicalName: "branch_n015_border_oath",
    title: "支线种子：B1 边界誓约与守界互证",
    summary: "麟泽需要可验证的守界行为，而非口号式跟队承诺。",
    detail:
      "对齐 profile questHooks（锚点誓约 / 边界巡视）。叙事重点：锚点仪式中的「共同责任」、对越界试探的冷硬回应、与主锚复活节拍的肌肉记忆违和。禁止单回合写完辅锚全貌。",
    sourceRef: "registry/majorNpcBranchSeeds.ts:n015",
    importance: 81,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "major_npc", "branch_seed", "N-015", "b1", "anchor"],
    profileHookIndex: 0,
  },
  {
    code: "truth:branch:n020_ribbon_supply",
    npcId: "N-020",
    canonicalName: "branch_n020_ribbon_supply",
    title: "支线种子：补给线与 ribbon 信任",
    summary: "灵伤在「被听见」与「被消费伤口」之间摇摆，并队门槛在保护性选择。",
    detail:
      "强调 profile 中 ribbon 向 hook；心悸式残响、句尾上扬与空白半拍、B1 噪声缓冲职能。deep+ 才点声纹/缓冲辅锚语义。",
    sourceRef: "registry/majorNpcBranchSeeds.ts:n020",
    importance: 80,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "major_npc", "branch_seed", "N-020", "b1", "supply"],
    profileHookIndex: 1,
  },
  {
    code: "truth:branch:n010_register_pivot",
    npcId: "N-010",
    canonicalName: "branch_n010_register_pivot",
    title: "支线种子：登记口与第一牵引",
    summary: "欣蓝验主锚非替身优先于体贴；表格是推迟失控的工具。",
    detail:
      "对齐 profile 双 hook：路线预告与转职登记。重点：拒代选命运、名单焦虑、与夜读账簿的张力。可给异常熟悉感，不得当全知剧透机。",
    sourceRef: "registry/majorNpcBranchSeeds.ts:n010",
    importance: 82,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "major_npc", "branch_seed", "N-010", "1f", "xinlan"],
    profileHookIndex: 0,
  },
  {
    code: "truth:branch:n018_ledger_trade",
    npcId: "N-018",
    canonicalName: "branch_n018_ledger_trade",
    title: "支线种子：交换账本与可持续对价",
    summary: "北夏并队必须计价；空头承诺会破坏他维持的平衡。",
    detail:
      "对齐 profile 首 hook（碎片交易）与龙月/空间碎片类命名。重点：欠条体感、二手市集组织者壳、deep+ 外联边缘。",
    sourceRef: "registry/majorNpcBranchSeeds.ts:n018",
    importance: 79,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "major_npc", "branch_seed", "N-018", "trade", "merchant"],
    profileHookIndex: 0,
  },
  {
    code: "truth:branch:n013_induction_script",
    npcId: "N-013",
    canonicalName: "branch_n013_induction_script",
    title: "支线种子：701 话术与诱导刃自救",
    summary: "枫把高危叙事包装成可赢剧本；并队需主锚证明非耗材。",
    detail:
      "强调 false_rescue 向 hook；戏剧社残留、替身梗耻感、与厨师剁肉频段对抗。deep 门闸见 deepSecret.revealConditions。",
    sourceRef: "registry/majorNpcBranchSeeds.ts:n013",
    importance: 80,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "major_npc", "branch_seed", "N-013", "7f", "induction"],
    profileHookIndex: 1,
  },
  {
    code: "truth:branch:n007_mirror_draft",
    npcId: "N-007",
    canonicalName: "branch_n007_mirror_draft",
    title: "支线种子：画室庇护与草案互锁",
    summary: "叶用冷淡挡诱导链；与枫草案互锁，任务验证后才共享并队级线索。",
    detail:
      "强调 sibling.old_day；轮廓触发保护欲违和、双胞胎镜像压力、辅锚之六镜像反制位。",
    sourceRef: "registry/majorNpcBranchSeeds.ts:n007",
    importance: 79,
    revealMinRank: REVEAL_TIER_RANK.fracture,
    tags: ["truth", "major_npc", "branch_seed", "N-007", "5f", "studio"],
    profileHookIndex: 1,
  },
];

export const MAJOR_NPC_BRANCH_SEEDS: readonly MajorNpcBranchSeed[] = BRANCH_SEED_TEMPLATES.map(finalizeBranchSeed);

/** coreCanonMapping：与 bootstrap 实体同内容的 LoreFact 行 */
export function buildMajorNpcBranchFactsForCanon(): Array<{
  factKey: string;
  canonicalText: string;
  tags: string[];
}> {
  return MAJOR_NPC_BRANCH_SEEDS.map((s) => ({
    factKey: `major_npc_branch:${s.code.replace("truth:branch:", "")}`,
    canonicalText: `【${s.title}】${s.summary} ${s.detail}`,
    tags: [
      ...s.tags,
      revealKnowledgeTagFromRank(s.revealMinRank),
      "major_npc_branch",
      `hook:${s.relatedQuestHook}`,
    ],
  }));
}

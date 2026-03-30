/**
 * 高魅力六人：支线扩写用短种子（非完整剧本）。
 * relatedQuestHook 由 `questHooksForMajorNpc` 按索引派生，避免与 npcProfiles 字符串漂移。
 * 与任务人物驱动模板对齐：`taskIssuerStyles.ts`（六人 issuerPersonaMode）。
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
      "对齐 questHooks（锚点誓约 / 边界巡视）。叙事重点：共同责任、越界试探时的冷硬、复活后「第一步」相关的肌肉记忆违和。deep+ 才允许点名校籍与辅锚语义；禁止单回合写全貌。",
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
      "强调 ribbon 向 hook；心悸式残响、句尾上扬与空白半拍、B1 缓冲职能。fracture 只写播报感/底噪依赖，不写校名社团；deep+ 才点声纹与辅锚语义。",
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
      "对齐双 hook：路线预告与转职登记。重点：拒代选命运、名单焦虑、与夜读账簿的张力。欣蓝可更强牵引，但 fracture 仍禁一口说尽旧身份；可给异常熟悉感，不得当全知剧透机。",
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
      "对齐首 hook（碎片交易）与龙月/空间碎片类命名。重点：欠条体感、审计式口吻、货源含糊；fracture 不写外联/市集组织者专名；deep+ 才收束边缘身份。",
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
      "强调 false_rescue 向 hook；剧本腔、替身隐喻、耻感外壳，与厨师剁肉频段对抗。fracture 不点名戏剧社；deep 门闸见 deepSecret.revealConditions。",
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
      "强调 sibling.old_day；轮廓触发保护欲违和、镜像压力。fracture 不点名美术社/草案专名；deep+ 才收束辅锚镜像反制语义。",
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

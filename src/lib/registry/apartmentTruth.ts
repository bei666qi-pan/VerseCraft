// src/lib/registry/apartmentTruth.ts
// 如月公寓真相档案（Root Canon）：仅保留不可变根因果。

import { buildImmutableRootCanonBlock, buildStableMechanismAnchorBlock } from "./rootCanon";
import { buildSchoolCycleRootEpigraph } from "./schoolCycleCanon";
import { buildSystemCanonBlock } from "./worldOrderRegistry";
import { REVEAL_TIER_RANK } from "./revealTierRank";

/** 公寓根真相：保持短小、稳定、不可变。更多事实走 structured registry + reveal tiers + runtime packet。 */
export const APARTMENT_TRUTH = `
## 【如月公寓根真相（不可变）】

${buildImmutableRootCanonBlock()}

【稳定机制锚点】
${buildStableMechanismAnchorBlock()}

【收容结构提要（不向玩家开局直述细节）】
${buildSchoolCycleRootEpigraph()}
`.trim();

export const APARTMENT_REVEAL_CANON = {
  surface: {
    rank: REVEAL_TIER_RANK.surface,
    title: "表层：误入与传闻",
    text: [
      "月初会有误入者从裂口跌进如月公寓；玩家只是其中之一，不是唯一主角。",
      "B1 是相对安全的缓冲层，能喘气、交易和整理，但不是无代价天堂。",
      "所谓守则多来自入住须知残页、住户传言、物业残页与前人笔记，真假参半，需要探索和交叉验证。",
      "B2 被传为出口方向，但地下二层不是可自由穿越的普通楼层。",
    ].join("\n"),
  },
  fracture: {
    rank: REVEAL_TIER_RANK.fracture,
    title: "裂缝：学校与公寓同源",
    text: [
      "学校灾变与公寓误入不是两起无关事件；裂口会周期性把学生气的新面孔卷入公寓泡层。",
      "楼层异常是空间机制的表层表现：登记、分拣、认知、声音、拟态、镜像、假出口分别承担不同消化秩序。",
      "原石更像稳定残响与账本信用，不是普通金币；B1 服务会把资源、关系和代价记入楼内秩序。",
    ].join("\n"),
  },
  deep: {
    rank: REVEAL_TIER_RANK.deep,
    title: "深层：泡层、锚点与调度",
    text: APARTMENT_TRUTH,
  },
  abyss: {
    rank: REVEAL_TIER_RANK.abyss,
    title: "深渊：出口审计",
    text: [
      APARTMENT_TRUTH,
      "B2 出口是真正穿透夹层的喉管。短暂时间窗、抵挡攻击或物理破门都不能替代出口资格链。",
      "最终离开必须把路线碎片、通行权限、钥物或等价资格、认可或替代通行、代价试炼与最终窗口行动全部对齐。",
    ].join("\n\n"),
  },
} as const;

export type ApartmentRevealCanonTier = keyof typeof APARTMENT_REVEAL_CANON;

/** 系统因果档案：解释玩法为何成立（给 world knowledge 与检索层使用）。 */
export const APARTMENT_SYSTEM_CANON = `
## 【如月公寓系统因果档案】

${buildSystemCanonBlock()}
`.trim();

/** Build the apartment truth block for DM injection */
export function buildApartmentTruthBlock(): string {
  return APARTMENT_TRUTH;
}

export function buildApartmentSystemCanonBlock(): string {
  return APARTMENT_SYSTEM_CANON;
}

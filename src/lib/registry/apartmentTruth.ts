// src/lib/registry/apartmentTruth.ts
// 如月公寓真相档案（Root Canon）：仅保留不可变根因果。

import { buildImmutableRootCanonBlock, buildStableMechanismAnchorBlock } from "./rootCanon";
import { buildSchoolCycleRootEpigraph } from "./schoolCycleCanon";
import { buildSystemCanonBlock } from "./worldOrderRegistry";

/** 公寓根真相：保持短小、稳定、不可变。更多事实走 structured registry + reveal tiers + runtime packet。 */
export const APARTMENT_TRUTH = `
## 【如月公寓根真相（不可变）】

${buildImmutableRootCanonBlock()}

【稳定机制锚点】
${buildStableMechanismAnchorBlock()}

【收容结构提要（不向玩家开局直述细节）】
${buildSchoolCycleRootEpigraph()}
`.trim();

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

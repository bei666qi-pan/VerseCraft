/**
 * 六位高魅力 NPC 结构化正典入口（辅锚 / 校源徘徊者）。
 * 单一事实源：`majorNpcDeepCanon.ts`；本文件提供分类语义与可序列化切片，供 packet / RAG / 工具消费。
 */

import {
  MAJOR_NPC_DEEP_CANON,
  MAJOR_NPC_IDS,
  buildMajorNpcKeyHintsForPacket,
  getMajorNpcDeepCanon,
  patchMajorNpcSocialGraph,
} from "./majorNpcDeepCanon";
import type { MajorNpcDeepCanonEntry, MajorNpcId, MajorWandererSubtype } from "./majorNpcDeepCanon";

export type { MajorNpcDeepCanonEntry, MajorNpcId, MajorWandererSubtype, MajorNpcRevealStage } from "./majorNpcDeepCanon";
export { MAJOR_NPC_DEEP_CANON, MAJOR_NPC_IDS, buildMajorNpcKeyHintsForPacket, getMajorNpcDeepCanon, patchMajorNpcSocialGraph };

/** 徘徊者子类：状态分类，非出身血统 */
export const WANDERER_SUBTYPE_MEANING: Record<MajorWandererSubtype, string> = {
  apartment_wanderer: "表层：公寓职能壳；玩家在楼道里遭遇的『工作人格』与可执行流程。",
  school_wanderer: "深层：耶里事故链上的校籍残留；技能、创伤与旧闭环来自校内角色。",
  residual_echo: "残响：与主锚循环 / 复活节拍耦合的记忆碎片；非恋爱羁绊脚本。",
};

/** 可进 JSON / 向量库的结构化切片（不含长篇 surface 段落，避免与 RAG 全文重复时可改用 getMajorNpcDeepCanon） */
export function getMajorNpcStructuredRecord(id: MajorNpcId): Record<string, unknown> {
  const m = MAJOR_NPC_DEEP_CANON[id];
  return {
    id: m.id,
    displayName: m.displayName,
    resonanceSlot: m.resonanceSlot,
    teamBridgeRole: m.teamBridgeRole,
    wandererSubtype: m.wandererSubtype,
    wandererSubtypeMeanings: m.wandererSubtype.map((k) => ({ key: k, line: WANDERER_SUBTYPE_MEANING[k] })),
    publicMaskRole: m.publicMaskRole,
    apartmentSurfaceDuty: m.apartmentSurfaceDuty,
    schoolIdentity: m.schoolIdentity,
    survivalRole: m.survivalRole,
    schoolWandererNote: m.schoolWandererNote,
    residualEchoToProtagonist: m.residualEchoToProtagonist,
    whyNotImmediateAlly: m.whyNotImmediateAlly,
    naturalContactChain: m.naturalContactChain,
    partyRelinkConditions: m.partyRelinkConditions,
    partyRelinkTriggers: m.partyRelinkTriggers,
    riskTriggers: m.riskTriggers,
    traumaMechanism: m.traumaMechanism,
    revealStages: m.revealStages,
    implementationNotes: m.implementationNotes,
    relationships: m.socialProfile.relationships,
    immutable_relationships: m.socialProfile.immutable_relationships,
    weakness: m.socialProfile.weakness,
    scheduleBehavior: m.socialProfile.scheduleBehavior,
    coreFearLine: m.coreFearLine,
    taskStyle: m.taskStyle,
    truthfulnessBand: m.truthfulnessBand,
  };
}

export function listAllMajorNpcStructuredRecords(): Record<string, unknown>[] {
  return MAJOR_NPC_IDS.map((id) => getMajorNpcStructuredRecord(id));
}

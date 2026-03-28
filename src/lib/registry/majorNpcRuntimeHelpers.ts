/**
 * 高魅力六人 → runtime packet 的短行裁剪（深层正文仍在 majorNpcDeepCanon，此处只负责预算一致的截断）。
 */

import type { MajorNpcDeepCanonEntry } from "./majorNpcDeepCanon";
import { clipPacketLine } from "./runtimePacketStrings";

/** 与 worldSchoolRuntimePackets.buildMajorNpcArcPacket 原魔法数对齐 */
export const MAJOR_NPC_ARC_CLIP = {
  surfaceDuty: 56,
  dutyEcho: 100,
  schoolResidue: 88,
  residualEcho: 72,
  joinVector: 80,
} as const;

export function majorNpcSurfaceDutyOneLiner(duty: string): string {
  return clipPacketLine(duty, MAJOR_NPC_ARC_CLIP.surfaceDuty);
}

export function majorNpcDutyEchoHint(duty: string): string {
  return clipPacketLine(duty, MAJOR_NPC_ARC_CLIP.dutyEcho);
}

export function majorNpcSchoolResidueHint(schoolIdentity: string): string {
  return clipPacketLine(schoolIdentity, MAJOR_NPC_ARC_CLIP.schoolResidue);
}

export function majorNpcResidualEchoHint(line: string): string {
  return clipPacketLine(line, MAJOR_NPC_ARC_CLIP.residualEcho);
}

export function majorNpcJoinVectorHint(line: string): string {
  return clipPacketLine(line, MAJOR_NPC_ARC_CLIP.joinVector);
}

/** 供任务/支线注册时引用：表层一句职能 + 深层一句钩子（非全文） */
export function majorNpcBranchSeedLines(m: MajorNpcDeepCanonEntry): {
  surfaceBeat: string;
  deepHook: string;
} {
  return {
    surfaceBeat: majorNpcSurfaceDutyOneLiner(m.apartmentSurfaceDuty),
    deepHook: majorNpcSchoolResidueHint(m.schoolIdentity),
  };
}

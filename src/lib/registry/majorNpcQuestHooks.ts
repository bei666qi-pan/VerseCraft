/**
 * 高魅力六人 questHooks 单一真源：与 npcProfiles 同步，供 branch seeds / relink 文档 / 任务注册对齐。
 * 人物向任务风格默认值见 `src/lib/tasks/taskIssuerStyles.ts`（issuerPersonaMode 等）。
 */

import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import { MAJOR_NPC_IDS, type MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";
import { PARTY_RELINK_REGISTRY } from "@/lib/registry/partyRelinkRegistry";

export function questHooksForMajorNpc(id: MajorNpcId): readonly string[] {
  const p = CORE_NPC_PROFILES_V2.find((x) => x.id === id);
  return p?.interaction.questHooks ?? [];
}

/** 断言六人均有非空 hooks（单测调用） */
export function assertAllMajorNpcQuestHooksPresent(): void {
  for (const id of MAJOR_NPC_IDS) {
    const h = questHooksForMajorNpc(id);
    if (h.length === 0) throw new Error(`major npc ${id} missing questHooks in CORE_NPC_PROFILES_V2`);
  }
}

/** 与 party/majorNpc relink 任务追踪子串对齐的针集合（供任务标题 / worldFlags 设计参考） */
export function relinkTriggerNeedlesForMajorNpc(id: MajorNpcId): readonly string[] {
  return PARTY_RELINK_REGISTRY[id]?.relinkTriggerTasks ?? [];
}

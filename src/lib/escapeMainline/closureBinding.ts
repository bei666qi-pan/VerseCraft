/**
 * 逃离主线关键条件 ↔ 世界闭环矩阵（WORLD_CLOSURE_MATRIX）的显式绑定。
 *
 * 背景：`deriveEscapeFactors`（见 ./derive）判定 obtain_b2_access / secure_key_item /
 * gain_trust_from_gatekeeper / survive_cost_trial 时用到的具体 npcId / itemId，此前是
 * derive.ts 内部的裸字面量，与 `WORLD_CLOSURE_MATRIX`（每层楼的权威一致性表）零引用
 * 关系——两边各自维护同一批事实，任一边改名/删除都不会被另一边发现（静默漂移风险）。
 *
 * 本文件把这些字面量集中声明为具名常量并从 WORLD_CLOSURE_MATRIX 反查校验，供 derive.ts
 * 引用、供测试断言一致性。只做只读交叉校验，不改变 derive.ts 原有的运行时分支逻辑，也不
 * 改变任何现有单测断言的具体字面量值（"N-018" / "N-010" / "I-C12" / 45 / 50 均保持不变）。
 */

import { WORLD_CLOSURE_BY_FLOOR } from "@/lib/registry/worldClosureMatrix";

/** 守门人所在楼层：登记口 / 物业口（欣蓝、北夏均在此层承担守门职能）。 */
export const ESCAPE_GATEKEEPER_FLOOR_ID = "1" as const;

/** 授予"守门人信任"条件的两名 NPC（任一达到各自阈值即算满足）。 */
export const ESCAPE_GATEKEEPER_NPC_IDS = ["N-018", "N-010"] as const;

/** 与 ESCAPE_GATEKEEPER_NPC_IDS 一一对应的信任阈值。 */
export const ESCAPE_GATEKEEPER_TRUST_THRESHOLDS: Record<(typeof ESCAPE_GATEKEEPER_NPC_IDS)[number], number> = {
  "N-018": 45,
  "N-010": 50,
};

/**
 * 关键钥物：欣蓝名下的备用电池。
 * 注：derive.ts 原注释自称"示例钥物"——是否应替换为更具叙事分量的道具，属于内容设计
 * 决策，不在本次"修复矩阵脱节"范围内，此处仅如实登记当前实现使用的道具 id。
 */
export const ESCAPE_KEY_ITEM_ID = "I-C12" as const;

/** 代价试炼任务 id（均由北夏 / N-018 发放，floorTier "1"）。 */
export const ESCAPE_COST_TRIAL_TASK_IDS = ["main_escape_cost_trial", "char_mirror_patrol_debt"] as const;

/** 唯一真正出口楼层。 */
export const ESCAPE_EXIT_FLOOR_ID = "B2" as const;

/**
 * 交叉校验：确认上述具名常量与 WORLD_CLOSURE_MATRIX 的楼层数据保持一致。
 * 返回空数组代表一致；非空数组每一项都是可读的不一致描述，供测试直接断言长度为 0，
 * 这样未来任何一边改名/删除都会让 CI 失败，而不是静默漂移。
 */
export function getEscapeClosureBindingIssues(): string[] {
  const issues: string[] = [];

  const gateFloor = WORLD_CLOSURE_BY_FLOOR[ESCAPE_GATEKEEPER_FLOOR_ID];
  if (!gateFloor) {
    issues.push(`WORLD_CLOSURE_BY_FLOOR 缺少楼层 ${ESCAPE_GATEKEEPER_FLOOR_ID}`);
  } else {
    for (const npcId of ESCAPE_GATEKEEPER_NPC_IDS) {
      if (!gateFloor.keyNpcIds.includes(npcId)) {
        issues.push(`守门人 ${npcId} 未出现在楼层 ${ESCAPE_GATEKEEPER_FLOOR_ID} 的 keyNpcIds 中`);
      }
    }
    if (!gateFloor.itemIds.includes(ESCAPE_KEY_ITEM_ID)) {
      issues.push(`关键钥物 ${ESCAPE_KEY_ITEM_ID} 未出现在楼层 ${ESCAPE_GATEKEEPER_FLOOR_ID} 的 itemIds 中`);
    }
  }

  const exitFloor = WORLD_CLOSURE_BY_FLOOR[ESCAPE_EXIT_FLOOR_ID];
  if (!exitFloor) {
    issues.push(`WORLD_CLOSURE_BY_FLOOR 缺少楼层 ${ESCAPE_EXIT_FLOOR_ID}`);
  } else if (!exitFloor.escapeRelevance) {
    issues.push(`出口楼层 ${ESCAPE_EXIT_FLOOR_ID} 缺少 escapeRelevance 描述`);
  }

  return issues;
}

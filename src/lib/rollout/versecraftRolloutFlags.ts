/**
 * VerseCraft 阶段 9：世界入口 / UI / 任务 / commit 工程化灰度开关。
 * 默认 true = 与当前主线路径一致；设为 false 可逐项回滚（需配合文档验收）。
 */

import { envBoolean, envRaw } from "@/lib/config/envRaw";

export type VerseCraftRolloutFlagsSnapshot = {
  /** 空间权柄单一底层 + 月初误入 + 到达正典（space_authority_baseline_packet） */
  enableSpaceAuthorityCanon: boolean;
  /** 月初误闯学生叙事入口（基线称呼 / 空间 packet 中的 resident 认知） */
  enableMonthlyStudentEntry: boolean;
  /** 首轮四选项由主笔实时生成（关闭则仅保留应急路径，不推荐生产关） */
  enableDynamicOpeningOptions: boolean;
  /** 玩家可见文案清洗（内部 N-xxx id → 显示名等） */
  enablePlayerFacingTextCleanup: boolean;
  /** 任务板可见性策略 V2（soft_lead 不上主路径等） */
  enableTaskVisibilityPolicyV2: boolean;
  /** 双核新手引导（老刘生存轴 + 麟泽边界轴）文案与 packet 权重 */
  enableNewPlayerGuideDualCore: boolean;
  /** NPC 同场社交表层（npc_social_surface_packet + peerRelationalCues） */
  enableNpcSocialSurface: boolean;
  /** 世界入口紧凑 packet（player_world_entry_packet 等） */
  enableWorldEntryPackets: boolean;
  /** 文风指导短块（动态 suffix，非模仿具体作品） */
  enableStyleGuidePacket: boolean;
  /** 客户端优先采用 __VERSECRAFT_FINAL__ 整帧作为 DM JSON（与既有 SSE 行为一致，用于观测/强制） */
  enableFinalFrameFirstCommit: boolean;
  /** UI 调试诊断（开发态；生产默认关） */
  enableUiDebugDiagnostics: boolean;
};

function readFlag(envName: string, defaultTrue: boolean): boolean {
  if (envRaw(envName) !== undefined) {
    return envBoolean(envName, defaultTrue);
  }
  return defaultTrue;
}

/** 每请求快照一次，避免多次读 env */
export function getVerseCraftRolloutFlags(): VerseCraftRolloutFlagsSnapshot {
  return {
    enableSpaceAuthorityCanon: readFlag("VERSECRAFT_ENABLE_SPACE_AUTHORITY_CANON", true),
    enableMonthlyStudentEntry: readFlag("VERSECRAFT_ENABLE_MONTHLY_STUDENT_ENTRY", true),
    enableDynamicOpeningOptions: readFlag("VERSECRAFT_ENABLE_DYNAMIC_OPENING_OPTIONS", true),
    enablePlayerFacingTextCleanup: readFlag("VERSECRAFT_ENABLE_PLAYER_FACING_TEXT_CLEANUP", true),
    enableTaskVisibilityPolicyV2: readFlag("VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2", true),
    enableNewPlayerGuideDualCore: readFlag("VERSECRAFT_ENABLE_NEW_PLAYER_GUIDE_DUAL_CORE", true),
    enableNpcSocialSurface: readFlag("VERSECRAFT_ENABLE_NPC_SOCIAL_SURFACE", true),
    enableWorldEntryPackets: readFlag("VERSECRAFT_ENABLE_WORLD_ENTRY_PACKETS", true),
    enableStyleGuidePacket: readFlag("VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET", true),
    enableFinalFrameFirstCommit: readFlag("VERSECRAFT_ENABLE_FINAL_FRAME_FIRST_COMMIT", true),
    enableUiDebugDiagnostics: readFlag("VERSECRAFT_ENABLE_UI_DEBUG_DIAGNOSTICS", false),
  };
}

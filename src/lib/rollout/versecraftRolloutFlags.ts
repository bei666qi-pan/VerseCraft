/**
 * VerseCraft 阶段 9：世界入口 / UI / 任务 / commit 工程化灰度开关。
 * 默认 true = 与当前主线路径一致；设为 false 可逐项回滚（需配合文档验收）。
 */

import { envBoolean, envRaw, envRawFirst } from "@/lib/config/envRaw";

export type VerseCraftRolloutFlagsSnapshot = {
  /** 设置页不再承担任务板入口（SettingsPanel 不渲染任务板） */
  enableSettingsTaskRemoval: boolean;
  /** 空间权柄单一底层 + 月初误入 + 到达正典（space_authority_baseline_packet） */
  enableSpaceAuthorityCanon: boolean;
  /** 月初误闯学生叙事入口（基线称呼 / 空间 packet 中的 resident 认知） */
  enableMonthlyStudentEntry: boolean;
  /** 首轮四选项由主笔实时生成（关闭则仅保留应急路径，不推荐生产关） */
  enableDynamicOpeningOptions: boolean;
  /** 玩家可见文案清洗（内部 N-xxx id → 显示名等） */
  enablePlayerFacingTextCleanup: boolean;
  /** 任务板可见性策略 V3（soft_lead 不上主路径等） */
  enableTaskVisibilityPolicyV3: boolean;
  /** 叙事中正式交付 formal_task 后生成任务提示信号；旧环境变量名保留兼容，不再自动打开 UI */
  enableTaskAutoOpenOnNarrativeGrant: boolean;
  /** 任务玩家友好文案 V2（更像“当前握着的事”，禁数据库腔/内部 id） */
  enablePlayerFacingTaskCopyV2: boolean;
  /** 普通回合 options 为空时自动走一次 options-only 补全 */
  enableOptionsAutoRegenOnEmpty: boolean;
  /** options-only 独立链路 V2（独立 prompt/packet，绕开主叙事管线） */
  enableOptionsOnlyRegenPathV2: boolean;
  /** 双核新手引导 V2（老刘生存轴 + 麟泽边界轴） */
  enableNewPlayerGuideDualCoreV2: boolean;
  /** NPC 同场社交表层（npc_social_surface_packet + peerRelationalCues） */
  enableNpcSocialSurface: boolean;
  /** 世界入口紧凑 packet（player_world_entry_packet 等） */
  enableWorldEntryPackets: boolean;
  /** 世界质感 packet（空间错位/月初压力/生活底噪） */
  enableWorldFeelPackets: boolean;
  /** 月初误闯学生世界逻辑表层化（world_feel_packet 子包） */
  enableMonthStartStudentWorldlogic: boolean;
  /** 文风指导短块（动态 suffix，非模仿具体作品） */
  enableStyleGuidePacket: boolean;
  /** 客户端优先采用 __VERSECRAFT_FINAL__ 整帧作为 DM JSON（与既有 SSE 行为一致，用于观测/强制） */
  enableFinalFrameFirstCommit: boolean;
  /** UI 调试诊断（开发态；生产默认关） */
  enableUiDebugDiagnostics: boolean;
  /** 隐藏战力系统 V1（纯计算/叙事结算锚点；默认关闭，灰度用） */
  enableHiddenCombatV1: boolean;
  /** 隐藏战力裁决层 V1（NPC/玩家/场景/结果分级；默认关闭，灰度用） */
  enableHiddenCombatAdjudicationV1: boolean;
  /** NPC 战斗风格注册表 V1（结构化风格约束块；默认关闭，灰度用） */
  enableNpcCombatStyleRegistryV1: boolean;
  /** 战斗裁决 prompt block V1（冲突回合增强叙事约束；默认关闭，灰度用） */
  enableCombatPromptBlockV1: boolean;
  /** 可选 combat_summary 回写（解析端先兼容“读到就收”；默认关闭，灰度用） */
  enableCombatSummaryV1: boolean;

  // -------- Phase6: long narrative + decision envelope + reality + anti-cheat --------
  /** 允许主笔产出/使用 turn_mode=narrative_only 的长叙事回合（禁回退为每回合四选一） */
  enableLongNarrativeMode: boolean;
  /** 允许主笔产出/使用 turn_mode=decision_required 的关键节点决策语义 */
  enableDecisionTurnMode: boolean;
  /** 主角锚定包（prompt） */
  enableProtagonistAnchorPacket: boolean;
  /** 现实感约束包（prompt） */
  enableRealityConstraintPacket: boolean;
  /** 生成后世界一致性修正（含主角漂移门闸） */
  enableWorldPostGenerationRewrite: boolean;
  /** 语言输入反作弊（输入层 intent-only 重写） */
  enableLanguageAntiCheat: boolean;
  /** decision_required 选项质量门闸（轻量去重/过滤换皮） */
  enableDecisionOptionQualityGate: boolean;

  /** 阶段7：职业身份闭环 */
  enableProfessionIdentityLoop: boolean;
  /** 阶段7：职业试炼叙事授予 */
  enableProfessionTrialNarrativeGrant: boolean;
  /** 职业 prompt 降噪 V1：减少常驻“收益/命中率/进度表”以避免抢戏 */
  enableProfessionPromptDietV1: boolean;
  /** 阶段7：武器生命周期（污染/维护/再锻） */
  enableWeaponLifecycleV1: boolean;
  /** 阶段7：武器化预览（不再依赖复制指令） */
  enableWeaponizationPreview: boolean;
  /** 阶段7：三主循环 packets（生存/关系/调查） */
  enablePlayabilityCoreLoopsV1: boolean;
  /** 阶段7：世界质感循环 packets（living_surface 等） */
  enableWorldFeelLoopPackets: boolean;
  /** 阶段7：actorId(u:/g:) analytics 写入 */
  enableActorIdentityAnalytics: boolean;
  /** 阶段7：游客统一 metrics（dashboard/realtime/retention 内部口径） */
  enableGuestUnifiedMetrics: boolean;
  /** 阶段7：session clock（online/active/read/idle） */
  enableSessionClockV1: boolean;
  /** 阶段7：管理后台玩法指标（profession/weapon/guide/return） */
  enableAdminPlaystyleMetrics: boolean;
};

function readFlag(envName: string, defaultTrue: boolean): boolean {
  if (envRaw(envName) !== undefined) {
    return envBoolean(envName, defaultTrue);
  }
  return defaultTrue;
}

function readFlagFirst(envNames: readonly string[], defaultTrue: boolean): boolean {
  const hit = envRawFirst(envNames);
  if (hit !== undefined) {
    const name = envNames.find((n) => envRaw(n) !== undefined) ?? envNames[0]!;
    return envBoolean(name, defaultTrue);
  }
  return defaultTrue;
}

/** 每请求快照一次，避免多次读 env */
export function getVerseCraftRolloutFlags(): VerseCraftRolloutFlagsSnapshot {
  return {
    enableSettingsTaskRemoval: readFlag("VERSECRAFT_ENABLE_SETTINGS_TASK_REMOVAL", true),
    enableSpaceAuthorityCanon: readFlag("VERSECRAFT_ENABLE_SPACE_AUTHORITY_CANON", true),
    enableMonthlyStudentEntry: readFlag("VERSECRAFT_ENABLE_MONTHLY_STUDENT_ENTRY", true),
    enableDynamicOpeningOptions: readFlag("VERSECRAFT_ENABLE_DYNAMIC_OPENING_OPTIONS", true),
    enablePlayerFacingTextCleanup: readFlag("VERSECRAFT_ENABLE_PLAYER_FACING_TEXT_CLEANUP", true),
    enableTaskVisibilityPolicyV3: readFlagFirst(
      ["VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V3", "VERSECRAFT_ENABLE_TASK_VISIBILITY_POLICY_V2"],
      true
    ),
    enableTaskAutoOpenOnNarrativeGrant: readFlag("VERSECRAFT_ENABLE_TASK_AUTO_OPEN_ON_NARRATIVE_GRANT", true),
    enablePlayerFacingTaskCopyV2: readFlag("VERSECRAFT_ENABLE_PLAYER_FACING_TASK_COPY_V2", true),
    enableOptionsAutoRegenOnEmpty: readFlag("VERSECRAFT_ENABLE_OPTIONS_AUTO_REGEN_ON_EMPTY", true),
    enableOptionsOnlyRegenPathV2: readFlagFirst(
      ["VERSECRAFT_ENABLE_OPTIONS_ONLY_REGEN_PATH_V2"],
      true
    ),
    enableNewPlayerGuideDualCoreV2: readFlagFirst(
      ["VERSECRAFT_ENABLE_NEW_PLAYER_GUIDE_DUAL_CORE_V2", "VERSECRAFT_ENABLE_NEW_PLAYER_GUIDE_DUAL_CORE"],
      true
    ),
    enableNpcSocialSurface: readFlag("VERSECRAFT_ENABLE_NPC_SOCIAL_SURFACE", true),
    enableWorldEntryPackets: readFlag("VERSECRAFT_ENABLE_WORLD_ENTRY_PACKETS", true),
    enableWorldFeelPackets: readFlag("VERSECRAFT_ENABLE_WORLD_FEEL_PACKETS", true),
    enableMonthStartStudentWorldlogic: readFlag("VERSECRAFT_ENABLE_MONTH_START_STUDENT_WORLDLOGIC", true),
    enableStyleGuidePacket: readFlag("VERSECRAFT_ENABLE_STYLE_GUIDE_PACKET", true),
    enableFinalFrameFirstCommit: readFlag("VERSECRAFT_ENABLE_FINAL_FRAME_FIRST_COMMIT", true),
    enableUiDebugDiagnostics: readFlag("VERSECRAFT_ENABLE_UI_DEBUG_DIAGNOSTICS", false),
    enableHiddenCombatV1: readFlag("VERSECRAFT_ENABLE_HIDDEN_COMBAT_V1", false),
    enableHiddenCombatAdjudicationV1: readFlag("VERSECRAFT_ENABLE_HIDDEN_COMBAT_ADJUDICATION_V1", false),
    enableNpcCombatStyleRegistryV1: readFlag("VERSECRAFT_ENABLE_NPC_COMBAT_STYLE_REGISTRY_V1", false),
    enableCombatPromptBlockV1: readFlag("VERSECRAFT_ENABLE_COMBAT_PROMPT_BLOCK_V1", false),
    enableCombatSummaryV1: readFlag("VERSECRAFT_ENABLE_COMBAT_SUMMARY_V1", false),

    enableLongNarrativeMode: readFlag("VERSECRAFT_ENABLE_LONG_NARRATIVE_MODE", true),
    enableDecisionTurnMode: readFlag("VERSECRAFT_ENABLE_DECISION_TURN_MODE", true),
    enableProtagonistAnchorPacket: readFlag("VERSECRAFT_ENABLE_PROTAGONIST_ANCHOR_PACKET", true),
    enableRealityConstraintPacket: readFlag("VERSECRAFT_ENABLE_REALITY_CONSTRAINT_PACKET", true),
    enableWorldPostGenerationRewrite: readFlag("VERSECRAFT_ENABLE_WORLD_POST_GENERATION_REWRITE", true),
    enableLanguageAntiCheat: readFlag("VERSECRAFT_ENABLE_LANGUAGE_ANTI_CHEAT", true),
    enableDecisionOptionQualityGate: readFlag("VERSECRAFT_ENABLE_DECISION_OPTION_QUALITY_GATE", true),

    enableProfessionIdentityLoop: readFlag("VERSECRAFT_ENABLE_PROFESSION_IDENTITY_LOOP", true),
    enableProfessionTrialNarrativeGrant: readFlag("VERSECRAFT_ENABLE_PROFESSION_TRIAL_NARRATIVE_GRANT", true),
    enableProfessionPromptDietV1: readFlag("VERSECRAFT_ENABLE_PROFESSION_PROMPT_DIET_V1", true),
    enableWeaponLifecycleV1: readFlag("VERSECRAFT_ENABLE_WEAPON_LIFECYCLE_V1", true),
    enableWeaponizationPreview: readFlag("VERSECRAFT_ENABLE_WEAPONIZATION_PREVIEW", true),
    enablePlayabilityCoreLoopsV1: readFlag("VERSECRAFT_ENABLE_PLAYABILITY_CORE_LOOPS_V1", true),
    enableWorldFeelLoopPackets: readFlag("VERSECRAFT_ENABLE_WORLD_FEEL_LOOP_PACKETS", true),
    enableActorIdentityAnalytics: readFlag("VERSECRAFT_ENABLE_ACTOR_IDENTITY_ANALYTICS", true),
    enableGuestUnifiedMetrics: readFlag("VERSECRAFT_ENABLE_GUEST_UNIFIED_METRICS", true),
    enableSessionClockV1: readFlag("VERSECRAFT_ENABLE_SESSION_CLOCK_V1", true),
    enableAdminPlaystyleMetrics: readFlag("VERSECRAFT_ENABLE_ADMIN_PLAYSTYLE_METRICS", true),
  };
}

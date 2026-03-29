/**
 * 场景权威：在场/离场、外貌回合、身份揭露门闸（与 memory 冲突时以本层为准）。
 */

import type { RevealTierRank } from "@/lib/registry/revealTierRank";

/** 叙事允许提及 NPC 的方式 */
export type NpcMentionMode = "present" | "heard_only" | "memory_only" | "forbidden";

/**
 * 注入运行时 JSON 的权威包；DM 必须服从，不得「临时召唤」离场 NPC 当场对白。
 */
export type NpcSceneAuthorityPacket = {
  currentSceneLocation: string | null;
  presentNpcIds: readonly string[];
  /** 已知位置但不在当前场景坐标内的 NPC */
  offscreenNpcIds: readonly string[];
  npcCurrentLocationMap: Record<string, string>;
  npcMentionModes: Record<string, NpcMentionMode>;
  npcCanonicalAppearanceMap: Record<string, { short: string; long: string }>;
  npcPublicRoleMap: Record<string, string>;
  /** true=校源/深层壳未授权，禁止跳层 */
  npcDeepRoleLockedMap: Record<string, boolean>;
  /** 在场且本场景尚未写过外貌，需用 canonical 首次落地 */
  firstAppearanceRequiredNpcIds: readonly string[];
  sceneAppearanceAlreadyWrittenIds: readonly string[];
  revealTierCapsByNpc: Record<string, RevealTierRank>;
  authorityRulesSummary: string;
};

/** 轻量场景引用（helper 用） */
export type NpcSceneRef = {
  currentSceneLocation: string | null;
  presentNpcIds: readonly string[];
};

export type BuildNpcSceneAuthorityInput = {
  currentSceneLocation: string | null;
  npcPositions: Array<{ npcId: string; location: string }>;
  sceneAppearanceAlreadyWrittenIds: string[];
  /** 玩家输入中出现的 N-xxx */
  mentionedNpcIdsFromInput: string[];
  /** 图鉴/关系 hint 中出现的 N-xxx（离场仍可 memory） */
  codexOrHintNpcIds?: string[];
  maxRevealRank: RevealTierRank;
};

export type NpcLocationValidationResult = {
  ok: boolean;
  warnings: string[];
};

export type NpcAppearanceValidationResult = {
  ok: boolean;
  warnings: string[];
  suggestion: "use_canonical_short" | "use_canonical_long" | "behavior_only_no_appearance_repeat";
};

export type NpcRoleLeakValidationResult = {
  ok: boolean;
  blockedTokens?: string[];
  reason?: string;
};

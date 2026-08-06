/**
 * 轻量级 NPC 回合状态机。
 *
 * 追踪每个在场 NPC 的对话流阶段，替代 stable prompt 中硬编码的 NPC 交互模式文案。
 * 状态：IDLE → APPROACHING → GREETING → CONVERSING → DEPARTING
 *
 * 注入为紧凑 JSON packet，模型据此决定 NPC 出场/对白/退场节奏，无需重复长篇规则。
 */

import {
  parseRuntimeNpcPrimitives,
} from "@/lib/playRealtime/runtimeContextPackets";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** NPC 回合对话阶段 */
export type NpcTurnPhase =
  | "IDLE"          // 不在场 / 尚未激活
  | "APPROACHING"   // 首次出场：需要环境过渡 + 生活化登场
  | "GREETING"      // 已在场但未被玩家直接搭话：保持在场感，最小动作承接
  | "CONVERSING"    // 玩家本回合或上回合点名该 NPC：活跃对白模式
  | "DEPARTING";    // NPC 连续 3+ 回合发言而玩家未回应：退场/淡出

/** 单 NPC 回合状态 */
export interface NpcTurnStateEntry {
  npcId: string;
  phase: NpcTurnPhase;
  /** 连续发言但未被玩家点名的回合数（用于判定 DEPARTING） */
  unaddressedSpeakStreak: number;
}

/** computeNpcTurnState 的完整输出 */
export interface NpcTurnStateResult {
  /** per-NPC 状态映射 */
  states: Record<string, NpcTurnStateEntry>;
  /** 玩家当前位置（从 playerContext 解析） */
  playerLocation: string | null;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** NPC ID 正则（N-后跟 3 位及以上数字） */
const NPC_ID_RE = /\bN-(\d{3,6})\b/gi;

/** 连续未点名发言回合数阈值：超过后触发 DEPARTING */
const DEPARTURE_STREAK_THRESHOLD = 3;

/** 回溯 assistant 消息的最大条数（用于统计 NPC 连续发言） */
const MAX_LOOKBACK_ASSISTANT_MSGS = 10;

// ---------------------------------------------------------------------------
// 辅助解析
// -------------------------------------------------------------------------//

/**
 * 从单条 assistant 消息的 narrative JSON 或纯文本中提取 NPC ID 集合。
 * 匹配形如 N-xxx 的 NPC 编码。
 */
function extractNpcIdsFromAssistantContent(content: string): Set<string> {
  const ids = new Set<string>();
  // 尝试解析 JSON（DM 回复通常是 JSON 包裹的 narrative）
  try {
    const parsed = JSON.parse(content) as { narrative?: unknown };
    if (typeof parsed.narrative === "string") {
      for (const m of parsed.narrative.matchAll(NPC_ID_RE)) {
        ids.add(normalizeNpcId(m[1]));
      }
    }
  } catch {
    // 非 JSON 时直接匹配
    for (const m of content.matchAll(NPC_ID_RE)) {
      ids.add(normalizeNpcId(m[1]));
    }
  }
  return ids;
}

/**
 * 从用户消息中提取玩家点名的 NPC ID。
 */
function extractNpcIdsFromUserContent(content: string): Set<string> {
  const ids = new Set<string>();
  for (const m of content.matchAll(NPC_ID_RE)) {
    ids.add(normalizeNpcId(m[1]));
  }
  return ids;
}

function normalizeNpcId(raw: string): string {
  return `N-${raw.padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// 主函数
// ---------------------------------------------------------------------------

/**
 * 给定当前场景上下文和对话历史，计算每个在场 NPC 的回合对话阶段。
 *
 * @param scene - 玩家状态字符串（playerContext），内含 NPC当前位置、场景外貌已描写 等
 * @param dialogueHistory - 对话历史消息（role/content）
 * @returns 每个 NPC 的状态映射
 */
export function computeNpcTurnState(
  scene: string,
  dialogueHistory: readonly { role: string; content: string }[],
): NpcTurnStateResult {
  // 1. 解析场景
  const primitives = parseRuntimeNpcPrimitives(scene, null);
  const playerLocation = primitives.location;
  const npcPositions = primitives.npcPositions;           // 所有已知 NPC 位置
  const appearedNpcIds = new Set(primitives.sceneNpcAppearanceWritten); // 已描写外貌的 NPC

  // 在场 NPC = 与玩家同位置的 NPC
  const presentNpcIds = new Set<string>();
  for (const pos of npcPositions) {
    if (pos.location === playerLocation) {
      presentNpcIds.add(pos.npcId);
    }
  }

  // 2. 分析对话历史
  // 玩家上一条消息中点名的 NPC
  const lastUserAddressedNpcIds = findLastUserAddressedNpcIds(dialogueHistory);

  // 每个 NPC 的连续发言未点名统计
  const unaddressedStreaks = computeUnaddressedSpeakStreaks(
    dialogueHistory,
    presentNpcIds,
    lastUserAddressedNpcIds,
  );

  // 3. 为每个在场 NPC 计算状态
  const states: Record<string, NpcTurnStateEntry> = {};

  for (const npcId of presentNpcIds) {
    const streak = unaddressedStreaks.get(npcId) ?? 0;

    // 规则 1：首次出场（在场但外貌未描写） → APPROACHING（优先级最高）
    if (!appearedNpcIds.has(npcId)) {
      states[npcId] = { npcId, phase: "APPROACHING", unaddressedSpeakStreak: streak };
      continue;
    }

    // 规则 2：玩家上回合点名 → CONVERSING
    if (lastUserAddressedNpcIds.has(npcId)) {
      states[npcId] = { npcId, phase: "CONVERSING", unaddressedSpeakStreak: streak };
      continue;
    }

    // 规则 3：连续 3+ 回合发言但玩家未点名 → DEPARTING
    if (streak >= DEPARTURE_STREAK_THRESHOLD) {
      states[npcId] = { npcId, phase: "DEPARTING", unaddressedSpeakStreak: streak };
      continue;
    }

    // 默认：已在场、已描写、未被点名 → GREETING
    states[npcId] = { npcId, phase: "GREETING", unaddressedSpeakStreak: streak };
  }

  return { states, playerLocation };
}

/**
 * 查找上一条 user 消息中点名的 NPC ID 集合。
 */
function findLastUserAddressedNpcIds(
  dialogueHistory: readonly { role: string; content: string }[],
): Set<string> {
  for (let i = dialogueHistory.length - 1; i >= 0; i--) {
    const msg = dialogueHistory[i];
    if (!msg || msg.role !== "user") continue;
    return extractNpcIdsFromUserContent(String(msg.content ?? ""));
  }
  return new Set();
}

/**
 * 统计每个在场 NPC 连续发言但未被玩家点名的回合数。
 *
 * 从最近的 assistant 消息向前回溯：
 * - 若 assistant 消息的 narrative 中包含该 NPC → streak += 1
 * - 若其间出现 user 消息点名该 NPC → streak 重置为 0
 * - 只回溯最近 MAX_LOOKBACK_ASSISTANT_MSGS 条 assistant 消息
 */
function computeUnaddressedSpeakStreaks(
  dialogueHistory: readonly { role: string; content: string }[],
  presentNpcIds: Set<string>,
  lastUserAddressedNpcIds: Set<string>,
): Map<string, number> {
  const streaks = new Map<string, number>();
  for (const npcId of presentNpcIds) {
    streaks.set(npcId, 0);
  }

  if (dialogueHistory.length === 0) return streaks;

  // 是否需要重置：上一条 user 消息中如果点名了某个 NPC，其 streak 从 0 开始
  const resetNpcIds = new Set(lastUserAddressedNpcIds);

  let assistantCount = 0;
  for (let i = dialogueHistory.length - 1; i >= 0 && assistantCount < MAX_LOOKBACK_ASSISTANT_MSGS; i--) {
    const msg = dialogueHistory[i];
    if (!msg) continue;

    if (msg.role === "assistant") {
      assistantCount++;
      const spokenNpcIds = extractNpcIdsFromAssistantContent(String(msg.content ?? ""));
      for (const npcId of presentNpcIds) {
        if (spokenNpcIds.has(npcId) && !resetNpcIds.has(npcId)) {
          streaks.set(npcId, (streaks.get(npcId) ?? 0) + 1);
        }
      }
    } else if (msg.role === "user") {
      // 如果这条 user 消息点名了某个 NPC，暂停该 NPC 的累加
      const addressedInThisTurn = extractNpcIdsFromUserContent(String(msg.content ?? ""));
      for (const npcId of presentNpcIds) {
        if (addressedInThisTurn.has(npcId)) {
          resetNpcIds.add(npcId);
        }
      }
    }
  }

  return streaks;
}

// ---------------------------------------------------------------------------
// 紧凑 JSON 注入块
// ---------------------------------------------------------------------------

/**
 * 将 NPC 回合状态序列化为紧凑 JSON 行，注入 dynamic suffix。
 *
 * 产出格式（单行，无换行）：
 *   {"npc_turn_state":{"N-008":"CONVERSING","N-010":"APPROACHING"}}
 *
 * 状态语义由 stable prompt 中的精简引用解释。
 */
export function buildNpcTurnStatePacket(result: NpcTurnStateResult): string {
  const phases: Record<string, string> = {};
  for (const [npcId, entry] of Object.entries(result.states)) {
    phases[npcId] = entry.phase;
  }
  if (Object.keys(phases).length === 0) return "";
  return JSON.stringify({ npc_turn_state: phases });
}

/**
 * 估算 packet 字符数（用于 prompt 预算跟踪）。
 */
export function estimateNpcTurnStatePacketChars(result: NpcTurnStateResult): number {
  return buildNpcTurnStatePacket(result).length;
}

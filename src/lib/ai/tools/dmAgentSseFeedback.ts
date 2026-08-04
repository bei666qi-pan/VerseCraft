// src/lib/ai/tools/dmAgentSseFeedback.ts
/**
 * DM Agent SSE 状态反馈帧
 *
 * 通过 SSE status frame 向前端推送 DM Agent 的执行状态，
 * 让玩家看到不同的处理阶段。
 *
 * 使用现有的 __VERSECRAFT_STATUS__ 约定和 writeStatusFrame 体系。
 */

import type { DmToolCallTrace } from "./dmAgentTypes";

// ============================================================
// Status Codes
// ============================================================

/** DM Agent 状态码 */
export const DM_AGENT_STATUS = {
  THINKING: "dm_agent_thinking",
  READING_STATE: "dm_agent_reading_state",
  RULE_JUDGMENT: "dm_agent_rule_judgment",
  FORGING: "dm_agent_forging",
  COMBAT: "dm_agent_combat",
  QUESTING: "dm_agent_questing",
  NARRATING: "dm_agent_narrating",
  DONE: "dm_agent_done",
  FALLBACK: "dm_agent_fallback",
} as const;

// ============================================================
// User-Visible Labels (Chinese, no internal tool names exposed)
// ============================================================

const STATUS_LABELS: Record<string, string> = {
  dm_agent_thinking: "DM 正在处理…",
  dm_agent_reading_state: "DM 正在查阅状态…",
  dm_agent_rule_judgment: "规则正在判定…",
  dm_agent_forging: "锻造中…",
  dm_agent_combat: "战斗判定中…",
  dm_agent_questing: "任务处理中…",
  dm_agent_narrating: "DM 正在书写…",
  dm_agent_done: "",
  dm_agent_fallback: "",
};

// ============================================================
// Tool → User Label Map
// ============================================================

/** 内部工具名 → 用户可见文案（不暴露工具名和思维链） */
export const TOOL_USER_LABELS: Record<string, string> = {
  get_player_state: "查阅状态中…",
  get_inventory: "检查背包中…",
  get_active_quests: "查阅任务中…",
  get_world_context: "感知周围…",
  get_combat_state: "评估战况…",
  inspect_forge_options: "检查锻造台…",
  issue_quest: "创建任务中…",
  update_quest_progress: "更新任务中…",
  forge_weapon: "锻造中…",
  consume_materials: "消耗材料中…",
  grant_item: "获得物品中…",
  start_combat: "战斗开始…",
  resolve_combat_action: "战斗判定中…",
  apply_world_event: "世界变化中…",
};

/**
 * 获取用户可见的状态标签（不暴露内部工具名/思维链）
 */
export function getUserVisibleStatusLabel(internalStatus: string): string {
  return STATUS_LABELS[internalStatus] ?? "处理中…";
}

/**
 * 获取工具对应的用户可见文案
 */
export function getToolUserLabel(toolName: string, ok: boolean): string {
  if (!ok) return "操作失败";
  return TOOL_USER_LABELS[toolName] ?? "操作完成";
}

// ============================================================
// Traces → Summary
// ============================================================

/** 从工具追踪记录构建汇总信息 */
export function buildDmAgentSummary(traces: DmToolCallTrace[]): {
  toolsCalled: number;
  toolsSucceeded: number;
  toolsFailed: number;
  totalToolLatencyMs: number;
} {
  const successCount = traces.filter((t) => t.ok).length;
  const failCount = traces.filter((t) => !t.ok).length;
  const totalLatency = traces.reduce((sum, t) => sum + t.latencyMs, 0);

  return {
    toolsCalled: traces.length,
    toolsSucceeded: successCount,
    toolsFailed: failCount,
    totalToolLatencyMs: totalLatency,
  };
}

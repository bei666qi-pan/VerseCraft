// src/lib/ai/tools/playerNarrativeStateDeltaMerger.ts
/**
 * Phase 5.C: submit_narrative 工具 + write tool 结果 → DM JSON 候选
 *
 * 真·可执行工具路径下，LLM 不再自己填 state 字段（awarded_items / new_tasks / ...），
 * 而是通过：
 *   1. write tools (grant_item / consume_materials / move_player / ...) 真实改 state
 *   2. submit_narrative 工具提交 narrative + options（仅这 4 字段）
 *
 * 本模块把这两类输出合并成一个完整 DM JSON 候选，让下游 normalize/resolve/commit
 * 不需要任何修改。state 字段只能来自 write tool 的 typed result（不是 LLM 自己声明），
 * 从根上消除 "narrative 描述了 X 但 server state 没变" 那一类幻觉。
 *
 * 验收对应 openspec/changes/integrate-bounded-dm-agent-tools/specs/
 *   symbolic-world-model-player-chat/spec.md
 *   Scenario: LLM 调 grant_item 后写 narrative 说获得物品
 *     → server 端把 grant_item 的 typed result 映射到 awarded_items[]
 *     → commitTurn 落库 awarded_items
 *     → narrative 与 state 一致，无 drift
 */

// ============================================================
// 类型
// ============================================================

/** submit_narrative 工具的 4-字段 args（严格 schema，additionalProperties: false） */
export interface SubmitNarrativeArgs {
  narrative: string;
  options: string[];
  turn_mode: "decision_required";
  decision_required: true;
}

/** 单个 write tool 的 typed result（来自 mechanicsToolHandlers 的返回 data 字段） */
export interface WriteToolResult {
  toolName: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  code?: string;
  /** latency in ms */
  latencyMs?: number;
}

/** 合成 DM JSON 时用到的输入 */
export interface PlayerNarrativeMergeInput {
  submitNarrativeArgs: SubmitNarrativeArgs;
  writeToolResults: WriteToolResult[];
  /** 漂移检测 flag — 由 playerNarrativeDriftGuard 写入 */
  driftFlags?: {
    /** state-affecting drift 被自动 insert 了 write tool（drift_auto_inserted） */
    autoInserted?: boolean;
    /** 装饰性 drift 被忽略（drift_acknowledged） */
    acknowledged?: boolean;
  };
  /** tool loop 异常结束 */
  toolLoopBudgetExhausted?: boolean;
}

// ============================================================
// DM JSON 字段映射表
// ============================================================

/**
 * write tool result → DM JSON state 字段的映射表。
 * 与 mechanicsStateDeltaMerger (Phase 1) 的合并规则保持一致。
 *
 * 字段写空 = 工具没被调用；写非空 = 工具的 typed result data 进入。
 */
const WRITE_TOOL_TO_DM_FIELD: Record<string, string> = {
  grant_item: "awarded_items",
  consume_materials: "consumed_items",
  move_player: "player_location",
  set_npc_mood: "npc_mood_updates",
  advance_time: "time_advance_ticks",
  issue_quest: "new_tasks",
  update_quest_progress: "task_updates",
  forge_weapon: "weapon_updates",
  start_combat: "combat_state",
  resolve_combat_action: "combat_action",
  apply_world_event: "world_risks",
};

/**
 * 合成 DM JSON 候选。
 *
 * 必含 4 个最低契约字段（与 §3.1 一致）：is_action_legal / sanity_damage / narrative / is_death。
 * state 字段只能从 write tool results 合成（不是 LLM 声明）。
 */
export function buildPlayerNarrativeDmJson(input: PlayerNarrativeMergeInput): Record<string, unknown> {
  const dmJson: Record<string, unknown> = {
    // 最低 4 字段
    is_action_legal: true,
    sanity_damage: 0,
    narrative: input.submitNarrativeArgs.narrative,
    is_death: false,
    // 强制 decision_required
    consumes_time: true,
    turn_mode: "decision_required",
    decision_required: true,
    // 4 个 options（投影到 options + decision_options 两个字段，兼容下游）
    options: input.submitNarrativeArgs.options,
    decision_options: input.submitNarrativeArgs.options,
  };

  // State 字段：只从 write tool results 合成
  for (const result of input.writeToolResults) {
    if (!result.ok || !result.data) continue;
    const field = WRITE_TOOL_TO_DM_FIELD[result.toolName];
    if (!field) continue;
    if (field === "awarded_items") {
      const itemId = String(result.data.itemId ?? result.data.id ?? "");
      const source = String(result.data.source ?? "系统奖励");
      if (itemId) {
        const existing = (dmJson.awarded_items as Array<{ id: string; source?: string }> | undefined) ?? [];
        existing.push({ id: itemId, source });
        dmJson.awarded_items = existing;
      }
    } else if (field === "consumed_items") {
      const ids = Array.isArray(result.data.itemIds)
        ? result.data.itemIds.map((x) => String(x))
        : [];
      if (ids.length > 0) {
        dmJson.consumed_items = ((dmJson.consumed_items as string[] | undefined) ?? []).concat(ids);
      }
    } else if (field === "player_location") {
      const to = String(result.data.to ?? "");
      if (to) dmJson.player_location = to;
    } else if (field === "new_tasks") {
      const taskId = String(result.data.taskId ?? result.data.id ?? "");
      if (taskId) {
        const existing = (dmJson.new_tasks as unknown[] | undefined) ?? [];
        existing.push(result.data);
        dmJson.new_tasks = existing;
      }
    } else if (field === "task_updates") {
      const taskId = String(result.data.taskId ?? result.data.id ?? "");
      if (taskId) {
        const existing = (dmJson.task_updates as unknown[] | undefined) ?? [];
        existing.push(result.data);
        dmJson.task_updates = existing;
      }
    } else {
      // 通用 fallback：直接把 data 写进字段
      dmJson[field] = result.data;
    }
  }

  // commit flags（_commit_flags 是下游 normalize/validator 识别的元字段）
  const commitFlags: string[] = [];
  if (input.driftFlags?.autoInserted) commitFlags.push("drift_auto_inserted");
  if (input.driftFlags?.acknowledged) commitFlags.push("drift_acknowledged");
  if (input.toolLoopBudgetExhausted) commitFlags.push("tool_loop_budget_exhausted");
  if (commitFlags.length > 0) dmJson._commit_flags = commitFlags;

  // trace 元数据
  dmJson.player_narrative_merge = {
    submitNarrativeArgs: input.submitNarrativeArgs,
    writeToolCount: input.writeToolResults.length,
    writeToolNames: input.writeToolResults.map((r) => r.toolName),
  };

  return dmJson;
}

/** 写工具的 state 字段映射表 — 暴露给测试 */
export const WRITE_TOOL_STATE_FIELDS: Readonly<Record<string, string>> = WRITE_TOOL_TO_DM_FIELD;

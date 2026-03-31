export type TurnMode = "narrative_only" | "decision_required" | "system_transition";

export type NarrativeDensity = "low" | "medium" | "high";

/**
 * TurnEnvelope：服务端最终回合输出协议（phase-1）。
 *
 * 约束：
 * - 必须向后兼容旧字段（尤其是 legacy `options`），禁止破坏旧前端消费。
 * - 新语义字段必须可缺省（服务端会补默认/容错），前端在缺省时不得崩溃。
 */
export type TurnEnvelope = {
  // Required base keys (client contract)
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
  consumes_time: boolean;
  /** 可选：细粒度时间成本（与 consumes_time 组合见 timeBudget.resolveHourProgressDelta） */
  time_cost?: "free" | "light" | "standard" | "heavy" | "dangerous";

  // Standardized fields (always present, never undefined)
  options: string[];
  currency_change: number;
  consumed_items: string[];
  consumed_time?: never;
  awarded_items: unknown[];
  awarded_warehouse_items: unknown[];
  codex_updates: unknown[];
  relationship_updates: unknown[];
  new_tasks: unknown[];
  task_updates: unknown[];
  /** 手记线索增量（阶段 2+）；旧前端可忽略 */
  clue_updates: Array<Record<string, unknown>>;
  player_location?: string;
  npc_location_updates: unknown[];
  main_threat_updates: unknown[];
  weapon_updates: Array<Record<string, unknown>>;
  weapon_bag_updates: Array<Record<string, unknown>>;

  // Security / audit info (kept small)
  security_meta?: Record<string, unknown>;

  // Phase-1 light interaction hints (optional)
  ui_hints?: {
    auto_open_panel?: "task" | null;
    highlight_task_ids?: string[];
    toast_hint?: string | null;
    consistency_flags?: string[];
  };

  // Keep legacy optional keys if present
  bgm_track?: string;

  // --- Phase-1: new envelope semantic fields (backward-compatible) ---
  /**
   * 回合模式：
   * - narrative_only：长叙事推进；不要求玩家立刻做选项决策（options 可为空）。
   * - decision_required：关键节点；必须展示 2~4 条决策选项（见 decision_options）。
   * - system_transition：系统过场/结算前提示/强制切换；默认禁止普通 options 误触发。
   *
   * 缺省时按旧协议兼容：默认为 decision_required（由 resolver 归一化）。
   */
  turn_mode: TurnMode;

  /** 本回合叙事目标（短语/标签），缺省为空串 */
  narrative_goal: string;

  /** 叙事密度建议（用于未来前端/提示词联动），缺省为 medium */
  narrative_density: NarrativeDensity;

  /**
   * 是否必须决策（与 turn_mode 对齐的便捷布尔）。
   * - decision_required 模式下必须为 true
   * - 其他模式为 false
   */
  decision_required: boolean;

  /**
   * 新协议决策选项（2~4 条）。
   * - 旧字段 options 仍保留；当 decision_options 缺省时，resolver 会尽量从 options 映射。
   */
  decision_options: string[];

  /**
   * 仅当 decision_required=true 时使用：若为 true 表示必须要求前端阻止“无选项继续”。
   * 缺省 false（兼容旧行为）。
   */
  decision_required_strict: boolean;

  /**
   * narrative_only / system_transition 的自动续写提示（例如“（继续）”“（等待片刻）”），仅提示用。
   * 缺省为 null。
   */
  auto_continue_hint: string | null;

  /**
   * 主角锚点：用于长叙事稳定 POV/身份/动机（未来用于提示词或一致性检查）。
   * 缺省为空串。
   */
  protagonist_anchor: string;

  /** 世界一致性标记（机器可读短标签），缺省 [] */
  world_consistency_flags: string[];

  /** 反作弊/审计元信息（小体积），缺省 {} */
  anti_cheat_meta: Record<string, unknown>;
};


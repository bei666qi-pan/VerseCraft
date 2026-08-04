/**
 * 分阶段结构化轨迹（Structured Trace）
 *
 * 用途：为关键玩法流程输出适合测试和调试的结构化事件摘要。
 * 重点：定位"第一个出现差异的阶段"，不只输出最终结果。
 *
 * 设计约束：
 * - 纯数据结构，不输出日志、不写文件、不调 IO
 * - 不包含密码、Token、隐私信息
 * - 字段命名与游戏系统一致（combat、weapon、stats 等）
 * - 可序列化，便于 diff 和 snapshot testing
 */

// ── Trace Event Types ──────────────────────────────────────────────

export type TracePhase =
  | "scenario_setup"
  | "weapon_equip"
  | "weapon_unequip"
  | "weapon_forge"
  | "weapon_mod"
  | "weapon_infuse"
  | "weapon_repair"
  | "weapon_weaponize"
  | "profession_certify"
  | "profession_switch"
  | "attribute_change"
  | "combat_start"
  | "combat_score_player"
  | "combat_score_npc"
  | "combat_adjudicate"
  | "combat_resolve"
  | "combat_injury"
  | "combat_end"
  | "inventory_change"
  | "resource_change"
  | "save_snapshot"
  | "load_snapshot"
  | "invariant_check";

export interface TraceEvent {
  /** 事件序号（从 1 开始） */
  seq: number;
  /** 阶段名 */
  phase: TracePhase;
  /** 时间戳（相对，ms 从场景开始计算） */
  ts: number;
  /** 操作描述 */
  action: string;
  /** 参与者 */
  actor?: string;
  /** 目标 */
  target?: string;
  /** 相关 ID */
  characterId?: string;
  jobId?: string;
  weaponId?: string;
  skillId?: string;
  /** 锻造前后数据 */
  forgeBefore?: { stability?: number; contamination?: number; mods?: string[]; infusions?: string[] };
  forgeAfter?: { stability?: number; contamination?: number; mods?: string[]; infusions?: string[] };
  /** 属性变化 */
  statsBefore?: Record<string, number>;
  statsAfter?: Record<string, number>;
  /** 战斗数据 */
  baseValue?: number;
  weaponBonus?: number;
  jobMultiplier?: number;
  buffModifier?: number;
  critModifier?: number;
  finalValue?: number;
  /** 材料/资源 */
  materialsConsumed?: string[];
  materialsBefore?: number;
  materialsAfter?: number;
  /** RNG 信息 */
  rngSeed?: number;
  rngStep?: number;
  /** 配置/规则版本 */
  configVersion?: string;
  /** 额外上下文 */
  notes?: string;
}

export interface TraceSession {
  /** 场景名称 */
  scenario: string;
  /** 初始随机种子 */
  seed: number;
  /** 事件序列 */
  events: TraceEvent[];
  /** 开始时间（Unix ms） */
  startedAt: number;
  /** 结束时间（Unix ms），null 表示仍在进行中 */
  endedAt: number | null;
}

// ── Trace Builder ──────────────────────────────────────────────────

/**
 * 创建一个新的追踪会话。
 * @param scenario 场景名称
 * @param seed 随机种子
 */
export function createTraceSession(scenario: string, seed: number): TraceSession {
  return {
    scenario,
    seed,
    events: [],
    startedAt: Date.now(),
    endedAt: null,
  };
}

/**
 * 向追踪会话添加一个事件。
 */
export function pushTraceEvent(
  session: TraceSession,
  event: Omit<TraceEvent, "seq" | "ts"> & Partial<Pick<TraceEvent, "ts">>
): void {
  session.events.push({
    ...event,
    seq: session.events.length + 1,
    ts: event.ts ?? (Date.now() - session.startedAt),
  });
}

/**
 * 结束追踪会话。
 */
export function finalizeTraceSession(session: TraceSession): TraceSession {
  session.endedAt = Date.now();
  return session;
}

/**
 * 比较两个追踪会话，找到第一个差异事件的序号。
 * 返回 null 表示完全一致。
 */
export function findFirstDifference(
  a: TraceSession,
  b: TraceSession
): { seq: number; phase: string } | null {
  const maxLen = Math.max(a.events.length, b.events.length);
  for (let i = 0; i < maxLen; i++) {
    const ae = a.events[i];
    const be = b.events[i];
    if (!ae || !be) {
      return { seq: i + 1, phase: ae?.phase ?? be?.phase ?? "unknown" };
    }
    // 比较关键字段（忽略 seq 和 ts）
    const aStr = JSON.stringify({ ...ae, seq: 0, ts: 0 });
    const bStr = JSON.stringify({ ...be, seq: 0, ts: 0 });
    if (aStr !== bStr) {
      return { seq: ae.seq, phase: ae.phase };
    }
  }
  return null;
}

/**
 * 从追踪会话提取关键路径摘要（仅包含差异敏感字段）。
 */
export function traceDigest(session: TraceSession): string[] {
  return session.events.map(
    (e) =>
      `[${e.seq}] ${e.phase} | ${e.action} | weapon:${e.weaponId ?? "-"} job:${e.jobId ?? "-"} final:${e.finalValue ?? "-"} seed:${e.rngSeed ?? "-"}`
  );
}

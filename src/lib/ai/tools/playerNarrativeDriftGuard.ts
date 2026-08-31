// src/lib/ai/tools/playerNarrativeDriftGuard.ts
/**
 * Phase 5.C: narrative ↔ write tool 漂移检测
 *
 * 真·可执行工具路径下，state channel 与 narrative channel 物理隔离。但 LLM
 * 仍可能在 narrative 里"说"了状态变化（"你捡起一把剑"），却没有调对应的 write tool
 * （grant_item("iron_sword")）。这种"narrative-state drift"在 envelope 路径下是
 * 已知问题，Phase 5.C 用 drift guard 在收口前主动发现并修。
 *
 * 漂移分类（与 spec Scenario 列表一致）：
 * - state-affecting drift: narrative 明确声称状态变化但没对应 write tool →
 *   自动 insert 对应 write tool（写 _commit_flags.drift_auto_inserted）
 * - decorative drift: narrative 描述装饰性体验（"疲惫地靠在墙上"）但无状态
 *   影响 → pass-through（写 _commit_flags.drift_acknowledged）
 *
 * 简化版：基于中文关键字的启发式判断。完整版应基于 narrative → tool 映射表 +
 * LLM 校验。这一步的目标是兜底而非精确。
 */

import type { WriteToolResult } from "./playerNarrativeStateDeltaMerger";

// ============================================================
// 关键字映射：narrative 文本 → 期望的 write tool
// ============================================================

/** 强信号：narrative 提到这些动词 → 期望对应的 write tool */
const STATE_AFFECTING_KEYWORDS: ReadonlyArray<{
  patterns: readonly RegExp[];
  tool: string;
  /** drift 修复时该 insert 哪个工具 */
  autoInsert: string;
}> = [
  {
    patterns: [/(获得|得到|拿到|捡起|拾起|收到|领到|入手)/],
    tool: "grant_item",
    autoInsert: "grant_item",
  },
  {
    patterns: [/(消耗|用掉|用完|花掉)/],
    tool: "consume_materials",
    autoInsert: "consume_materials",
  },
  {
    // 走/去 必须紧跟方向词或句尾位置（避免"走廊"误命中）
    patterns: [/(走.{0,3}去|去.{0,3}里|走.{0,3}到|走向|移动|到达|进入|走开|走回|走到|去了)/],
    tool: "move_player",
    autoInsert: "move_player",
  },
  {
    patterns: [/(接.*任务|领.*任务|新.*任务|接到)/],
    tool: "issue_quest",
    autoInsert: "issue_quest",
  },
  {
    patterns: [/(完成.*任务|推进.*任务|更新.*任务)/],
    tool: "update_quest_progress",
    autoInsert: "update_quest_progress",
  },
  {
    patterns: [/(锻造|打造|铸造|铸剑|打铁)/],
    tool: "forge_weapon",
    autoInsert: "forge_weapon",
  },
  {
    patterns: [/(开始战斗|进入战斗|开战|应战)/],
    tool: "start_combat",
    autoInsert: "start_combat",
  },
];

/** 装饰性关键字：narrative 提到但无状态影响 → 忽略 */
const DECORATIVE_KEYWORDS: readonly RegExp[] = [
  /(疲惫|疲倦|劳累|困倦|累了)/,
  /(靠在|倚着|靠着)/,
  /(思考|琢磨|想着|回想)/,
  /(看着|望着|凝视|注视)/,
  /(深呼吸|呼了口气|叹息)/,
];

// ============================================================
// 类型
// ============================================================

export type DriftVerdict =
  | { kind: "no_drift" }
  | { kind: "decorative"; keywords: string[] }
  | { kind: "state_affecting"; expectedTools: string[]; autoInserted: string[] };

export interface DriftGuardInput {
  narrative: string;
  writeToolResults: WriteToolResult[];
}

export interface DriftGuardOutput {
  verdict: DriftVerdict;
  /** 修复建议的 write tool 列表（drift 时非空） */
  autoInserted: string[];
}

// ============================================================
// 主函数
// ============================================================

/**
 * 检测 narrative ↔ write tool 漂移。
 *
 * 规则：
 * 1. narrative 触发 state-affecting 关键字 + 对应 write tool 未被调用 → drift
 *    - 把所有缺失的 write tool 标记为 autoInserted（让调用方决定是否真 insert）
 * 2. narrative 触发 decorative 关键字 + 无 state-affecting 关键字 → 装饰性 drift
 * 3. narrative 无任何关键字 → 无 drift
 * 4. 已有对应 write tool 调用 → 即使 narrative 触发关键字也不算 drift
 */
export function checkPlayerNarrativeDrift(input: DriftGuardInput): DriftGuardOutput {
  const narrative = input.narrative;
  const calledTools = new Set(
    input.writeToolResults.filter((r) => r.ok).map((r) => r.toolName)
  );

  // 1. 找 state-affecting 漂移
  const stateAffectingExpected: string[] = [];
  const stateAffectingAutoInsert: string[] = [];
  for (const kw of STATE_AFFECTING_KEYWORDS) {
    if (kw.patterns.some((p) => p.test(narrative)) && !calledTools.has(kw.tool)) {
      stateAffectingExpected.push(kw.tool);
      stateAffectingAutoInsert.push(kw.autoInsert);
    }
  }

  if (stateAffectingExpected.length > 0) {
    return {
      verdict: {
        kind: "state_affecting",
        expectedTools: stateAffectingExpected,
        autoInserted: stateAffectingAutoInsert,
      },
      autoInserted: stateAffectingAutoInsert,
    };
  }

  // 2. 找 decorative 漂移
  const decorative: string[] = [];
  for (const p of DECORATIVE_KEYWORDS) {
    const m = narrative.match(p);
    if (m) decorative.push(m[0]);
  }
  if (decorative.length > 0) {
    return {
      verdict: { kind: "decorative", keywords: decorative },
      autoInserted: [],
    };
  }

  // 3. 无 drift
  return { verdict: { kind: "no_drift" }, autoInserted: [] };
}

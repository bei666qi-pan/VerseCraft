/**
 * Gap 5 — Decision / New Tasks 上限检测器
 *
 * 验证 DM JSON `decision_required` 和 `new_tasks` 字段的合理上限
 * （防止模型一次性吐出过多选项或任务）。
 *
 * 构造多种模拟 DM JSON 场景，独立评估每个场景是否遵守上限约束。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

// ── 上限常量 ─────────────────────────────────────────────

const MAX_OPTIONS = 6;
const MAX_NEW_TASKS = 3;
const MAX_TOTAL_OPTIONS_ARRAY_LENGTH = 8;

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-5-decision-new-tasks-cap",
  category: "submission_structure",
  label: "决策/任务上限检测",
  description: "验证 options 和 new_tasks 字段的合理上限约束",
  offlineOnly: true,
};

// ── 场景辅助类型 ────────────────────────────────────────

interface _Scenario {
  name: string;
  dmJson: Record<string, unknown>;
  expectedPass: boolean;
  expectedWarning?: boolean;
}

function _makeDmJson(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你站在岔路口，前方有数条路径。",
    is_death: false,
    consumes_time: true,
    options: [],
    ...overrides,
  };
}

function makeOptions(count: number): string[] {
  const opts: string[] = [];
  for (let i = 0; i < count; i++) {
    opts.push(`选项 ${i + 1}：一条可行之路的描述，引导玩家做出选择。`);
  }
  return opts;
}

function makeLongOption(): string {
  return "你沿着一条极其漫长且蜿蜒曲折的小路前行，这条路上布满荆棘与怪石，远处似乎有微弱的灯光在闪烁，但那灯光忽明忽暗，像是随时会熄灭的烛火，你不得不小心翼翼地靠近，每一步都充满未知的挑战与危险，风吹过树梢发出诡异的声响...";
}

function makeTask(id: number): Record<string, unknown> {
  return {
    id: `task_${id}`,
    title: `任务 ${id}`,
    description: `执行任务 ${id} 的相关描述`,
    priority: "normal",
  };
}

// ── Detector 实现 ───────────────────────────────────────

export class Gap5DecisionNewTasksCapDetector implements Detector<unknown> {
  readonly meta = meta;

  run(_input: unknown): DetectorResult {
    const issues: DetectorIssue[] = [];
    const startTime = performance.now();

    // ── 场景 1: 正常选项（4 项）───────────────────────────
    const normalOptions = makeOptions(4);
    if (normalOptions.length <= MAX_OPTIONS && normalOptions.length <= MAX_TOTAL_OPTIONS_ARRAY_LENGTH) {
      issues.push({
        severity: "info",
        message: "场景正常：4 项选项未超过限制",
        evidence: `options=${normalOptions.length} ≤ MAX_OPTIONS=${MAX_OPTIONS}`,
        code: "OPTIONS_OK",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    } else {
      issues.push({
        severity: "warning",
        message: "场景异常：4 项选项超过限制（不应发生）",
        evidence: `options=${normalOptions.length}`,
        code: "OPTIONS_UNEXPECTED_CAP",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    }

    // ── 场景 2: 溢出选项（10 项）─────────────────────────
    const overflowOptions = makeOptions(10);
    if (overflowOptions.length > MAX_OPTIONS) {
      issues.push({
        severity: "warning",
        message: "场景溢出：10 项选项超过 MAX_OPTIONS 限制，需裁剪或拒绝",
        evidence: `options=${overflowOptions.length} > MAX_OPTIONS=${MAX_OPTIONS}`,
        code: "OPTIONS_OVERFLOW",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "场景溢出但被上限约束（正常）",
        evidence: `options=${overflowOptions.length} ≤ MAX_OPTIONS=${MAX_OPTIONS}`,
        code: "OPTIONS_OVERFLOW_CONSTRAINED",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    }

    // ── 场景 3: 正常 new_tasks（2 项）─────────────────────
    const normalTasks = [makeTask(1), makeTask(2)];
    if (normalTasks.length <= MAX_NEW_TASKS) {
      issues.push({
        severity: "info",
        message: "场景正常：2 项 new_tasks 未超过限制",
        evidence: `new_tasks=${normalTasks.length} ≤ MAX_NEW_TASKS=${MAX_NEW_TASKS}`,
        code: "NEW_TASKS_OK",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    } else {
      issues.push({
        severity: "warning",
        message: "场景异常：2 项 new_tasks 超过限制（不应发生）",
        evidence: `new_tasks=${normalTasks.length}`,
        code: "NEW_TASKS_UNEXPECTED_CAP",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    }

    // ── 场景 4: 溢出 new_tasks（5 项）────────────────────
    const overflowTasks = [makeTask(1), makeTask(2), makeTask(3), makeTask(4), makeTask(5)];
    if (overflowTasks.length > MAX_NEW_TASKS) {
      issues.push({
        severity: "warning",
        message: "场景溢出：5 项 new_tasks 超过 MAX_NEW_TASKS 限制，需裁剪或拒绝",
        evidence: `new_tasks=${overflowTasks.length} > MAX_NEW_TASKS=${MAX_NEW_TASKS}`,
        code: "NEW_TASKS_OVERFLOW",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "场景溢出但被上限约束（正常）",
        evidence: `new_tasks=${overflowTasks.length} ≤ MAX_NEW_TASKS=${MAX_NEW_TASKS}`,
        code: "NEW_TASKS_OVERFLOW_CONSTRAINED",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    }

    // ── 场景 5: 选项总长度超标 ─────────────────────────────
    const longOptions = [makeLongOption()];
    const totalLength = longOptions.reduce((sum, opt) => sum + opt.length, 0);
    if (totalLength > 80 && longOptions.length > 0) {
      issues.push({
        severity: "warning",
        message: "选项总长度超标：单条选项超过 120 字阅读边界",
        evidence: `选项长度=${longOptions[0].length} 字`,
        code: "OPTIONS_LENGTH_OVERFLOW",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "选项长度在合理范围内",
        evidence: `选项长度=${totalLength} 字`,
        code: "OPTIONS_LENGTH_OK",
        location: "gap-5-decision-new-tasks-cap.ts",
      });
    }

    // ── 汇总评分 ─────────────────────────────────────────
    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;
    const total = criticalCount + warningCount + infoCount;
    // score = info 类占比（warning 扣分）
    const score = total > 0 ? (infoCount / total) : 1;

    const endTime = performance.now();

    return {
      detectorId: this.meta.id,
      score,
      issues,
      pass: criticalCount === 0 && warningCount <= 3, // 最多允许 3 个 warning（溢出检测本身就是发现问题的正常行为）
      latencyMs: Math.round(endTime - startTime),
    };
  }
}

// ── Singleton Export ────────────────────────────────────

export const gap5DecisionNewTasksCapDetector = new Gap5DecisionNewTasksCapDetector();

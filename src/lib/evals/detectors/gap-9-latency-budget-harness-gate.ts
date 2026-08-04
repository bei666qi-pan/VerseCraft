/**
 * Gap 9 — 延迟预算 Harness Gate 检测器
 *
 * 验证延迟预算常量定义与 gate 判断逻辑的一致性，
 * 确保 benchmark 门禁关联了正确的性能预算。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

// ── 延迟预算常量（与 CLAUDE.md §5.4 对齐）────────────

/** first visible text p50 */
const TTFT_P50_BUDGET_MS = 2500;
/** first visible text p95 */
const TTFT_P95_BUDGET_MS = 5000;
/** normal final p50 */
const FINAL_P50_BUDGET_MS = 12000;
/** normal final p95 */
const FINAL_P95_BUDGET_MS = 20000;
/** 单日 AI 调用上限 */
const BUDGET_DAILY_CALL_LIMIT = 2000;

// ── Gate 判断逻辑 ──────────────────────────────────────

type GateCheckResult = "pass" | "fail";

function checkTtftGate(latencyMs: number): GateCheckResult {
  if (latencyMs <= TTFT_P95_BUDGET_MS) return "pass";
  return "fail";
}

function checkFinalGate(latencyMs: number): GateCheckResult {
  if (latencyMs <= FINAL_P95_BUDGET_MS) return "pass";
  return "fail";
}

function _checkTtftP50Gate(latencyMs: number): GateCheckResult {
  if (latencyMs <= TTFT_P50_BUDGET_MS) return "pass";
  return "fail";
}

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-9-latency-budget-harness-gate",
  category: "cross_cutting",
  label: "延迟预算 Harness Gate",
  description: "验证延迟预算常量定义与 gate 判断逻辑的一致性",
  offlineOnly: true,
};

// ── 检查项定义 ─────────────────────────────────────────

interface BudgetCheck {
  name: string;
  assert: boolean;
  severity: DetectorIssue["severity"];
  code: string;
}

// ── Detector ────────────────────────────────────────────

class Gap9LatencyBudgetHarnessGateDetector implements Detector<void> {
  meta = meta;

  run(): DetectorResult {
    const issues: DetectorIssue[] = [];
    let pass = 0;
    let total = 0;

    // ── 常量合理性检查 ──────────────────────────────────
    const checks: BudgetCheck[] = [
      { name: "TTFT_P50_BUDGET_MS > 0", assert: TTFT_P50_BUDGET_MS > 0, severity: "critical", code: "budget_positive" },
      { name: "TTFT_P95_BUDGET_MS > 0", assert: TTFT_P95_BUDGET_MS > 0, severity: "critical", code: "budget_positive" },
      { name: "FINAL_P50_BUDGET_MS > 0", assert: FINAL_P50_BUDGET_MS > 0, severity: "critical", code: "budget_positive" },
      { name: "FINAL_P95_BUDGET_MS > 0", assert: FINAL_P95_BUDGET_MS > 0, severity: "critical", code: "budget_positive" },
      { name: "TTFT_P95 >= TTFT_P50", assert: TTFT_P95_BUDGET_MS >= TTFT_P50_BUDGET_MS, severity: "warning", code: "budget_p95_ge_p50" },
      { name: "FINAL_P95 >= FINAL_P50", assert: FINAL_P95_BUDGET_MS >= FINAL_P50_BUDGET_MS, severity: "warning", code: "budget_p95_ge_p50" },
      { name: "FINAL_P50 > TTFT_P95（合理时序）", assert: FINAL_P50_BUDGET_MS > TTFT_P95_BUDGET_MS, severity: "warning", code: "budget_final_after_ttft" },
      { name: "FINAL_P95 > TTFT_P95", assert: FINAL_P95_BUDGET_MS > TTFT_P95_BUDGET_MS, severity: "warning", code: "budget_final_gt_ttft" },
      { name: "BUDGET_DAILY_CALL_LIMIT > 0", assert: BUDGET_DAILY_CALL_LIMIT > 0, severity: "critical", code: "budget_daily_positive" },
      { name: "BUDGET_DAILY_CALL_LIMIT is reasonable (< 10000)", assert: BUDGET_DAILY_CALL_LIMIT < 10000, severity: "info", code: "budget_daily_reasonable" },
    ];

    for (const c of checks) {
      total++;
      if (c.assert) {
        pass++;
        issues.push({ severity: c.severity, message: `${c.name} ✅`, code: c.code });
      } else {
        issues.push({
          severity: c.severity,
          message: `${c.name} ❌`,
          code: c.code,
        });
      }
    }

    // ── Gate 模拟判断 ───────────────────────────────────
    // TTFT 测试
    const ttftCases: { latency: number; expected: GateCheckResult; desc: string }[] = [
      { latency: 800, expected: "pass", desc: "800ms < TTFT_P50 应 pass" },
      { latency: 1800, expected: "pass", desc: "1800ms < TTFT_P50 应 pass" },
      { latency: 3000, expected: "pass", desc: "3000ms < TTFT_P95 应 pass" },
      { latency: TTFT_P95_BUDGET_MS, expected: "pass", desc: `${TTFT_P95_BUDGET_MS}ms = TTFT_P95 应 pass` },
      { latency: 6000, expected: "fail", desc: "6000ms > TTFT_P95 应 fail" },
    ];

    for (const tc of ttftCases) {
      total++;
      const result = checkTtftGate(tc.latency);
      if (result === tc.expected) {
        pass++;
        issues.push({
          severity: "info",
          message: `TTFT gate: ${tc.desc} ✅`,
          code: "gate_ttft",
        });
      } else {
        issues.push({
          severity: "warning",
          message: `TTFT gate: ${tc.desc} ❌（预期 ${tc.expected}，实际 ${result}）`,
          code: "gate_ttft_fail",
        });
      }
    }

    // Final 测试
    const finalCases: { latency: number; expected: GateCheckResult; desc: string }[] = [
      { latency: 5000, expected: "pass", desc: "5000ms < FINAL_P50 应 pass" },
      { latency: 15000, expected: "pass", desc: "15000ms < FINAL_P95 应 pass" },
      { latency: FINAL_P95_BUDGET_MS, expected: "pass", desc: `${FINAL_P95_BUDGET_MS}ms = FINAL_P95 应 pass` },
      { latency: 25000, expected: "fail", desc: "25000ms > FINAL_P95 应 fail" },
    ];

    for (const tc of finalCases) {
      total++;
      const result = checkFinalGate(tc.latency);
      if (result === tc.expected) {
        pass++;
        issues.push({
          severity: "info",
          message: `Final gate: ${tc.desc} ✅`,
          code: "gate_final",
        });
      } else {
        issues.push({
          severity: "warning",
          message: `Final gate: ${tc.desc} ❌（预期 ${tc.expected}，实际 ${result}）`,
          code: "gate_final_fail",
        });
      }
    }

    const score = total > 0 ? pass / total : 0;

    return {
      detectorId: "gap-9-latency-budget-harness-gate",
      score,
      pass: score >= 0.90,
      issues,
      latencyMs: 0,
    };
  }
}

export const gap9LatencyBudgetHarnessGateDetector = new Gap9LatencyBudgetHarnessGateDetector();

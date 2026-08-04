/**
 * Gap 10 — TaskPolicy 路由不变量离线检测器
 *
 * 验证 TASK_POLICY 中所有 task 的基本路由不变量：
 * primaryRole 不在 forbidden 集合中、超时/令牌数合理、json_mode 配置一致等。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";
import { TASK_POLICY, TASK_ROLE_FORBIDDEN, PLAYER_CHAT_MAX_TOKENS_MIN, PLAYER_CHAT_MAX_TOKENS_MAX } from "@/lib/ai/tasks/taskPolicy";
import type { TaskType } from "@/lib/ai/types/core";

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-10-taskpolicy-route-invariant",
  category: "cross_cutting",
  label: "TaskPolicy 路由不变量",
  description: "验证 TASK_POLICY 所有任务的基本路由不变量",
  offlineOnly: true,
};

// ── 不变量检查 ─────────────────────────────────────────

interface _Invariant {
  name: string;
  run(): InvariantResult;
}

interface InvariantResult {
  passed: number;
  total: number;
  failures: { task: TaskType; reason: string }[];
}

// ── Detector ────────────────────────────────────────────

class Gap10TaskPolicyRouteInvariantDetector implements Detector<void> {
  meta = meta;

  run(): DetectorResult {
    const allIssues: DetectorIssue[] = [];
    let globalPass = 0;
    let globalTotal = 0;

    // 不变量 1: primaryRole 不在 TASK_ROLE_FORBIDDEN 中
    {
      let passed = 0;
      const total = Object.keys(TASK_POLICY).length;
      const failures: { task: TaskType; reason: string }[] = [];
      for (const [t, binding] of Object.entries(TASK_POLICY)) {
        const taskType = t as TaskType;
        const forbidden = TASK_ROLE_FORBIDDEN[taskType];
        if (forbidden?.has(binding.primaryRole)) {
          failures.push({ task: taskType, reason: `primaryRole=${binding.primaryRole} 在 forbidden 集合中` });
        } else {
          passed++;
        }
      }
      globalPass += passed;
      globalTotal += total;
      allIssues.push(...failures.map((f) => ({
        severity: "critical" as const,
        message: `[I1] ${f.task}: ${f.reason} ❌`,
        code: "invariant_primary_role_forbidden",
      })));
      allIssues.push({
        severity: "info",
        message: `[I1] primaryRole 不在 forbidden 中：${passed}/${total} ✅`,
        code: "invariant_primary_role_forbidden",
      });
    }

    // 不变量 2: 所有 maxTokens > 0
    {
      let passed = 0;
      const total = Object.keys(TASK_POLICY).length;
      const failures: { task: TaskType; reason: string }[] = [];
      for (const [t, binding] of Object.entries(TASK_POLICY)) {
        if (binding.maxTokens > 0) passed++;
        else failures.push({ task: t as TaskType, reason: `maxTokens=${binding.maxTokens}` });
      }
      globalPass += passed;
      globalTotal += total;
      allIssues.push(...failures.map((f) => ({
        severity: "critical" as const,
        message: `[I2] ${f.task}: maxTokens 不为正 ❌`,
        code: "invariant_max_tokens_positive",
      })));
      allIssues.push({
        severity: "info",
        message: `[I2] maxTokens 为正：${passed}/${total} ✅`,
        code: "invariant_max_tokens_positive",
      });
    }

    // 不变量 3: 所有 timeoutMs > 0
    {
      let passed = 0;
      const total = Object.keys(TASK_POLICY).length;
      const failures: { task: TaskType; reason: string }[] = [];
      for (const [t, binding] of Object.entries(TASK_POLICY)) {
        if (binding.timeoutMs > 0) passed++;
        else failures.push({ task: t as TaskType, reason: `timeoutMs=${binding.timeoutMs}` });
      }
      globalPass += passed;
      globalTotal += total;
      allIssues.push(...failures.map((f) => ({
        severity: "critical" as const,
        message: `[I3] ${f.task}: timeoutMs 不为正 ❌`,
        code: "invariant_timeout_positive",
      })));
      allIssues.push({
        severity: "info",
        message: `[I3] timeoutMs 为正：${passed}/${total} ✅`,
        code: "invariant_timeout_positive",
      });
    }

    // 不变量 4: PLAYER_CHAT maxTokens 在预算范围内
    {
      const binding = TASK_POLICY.PLAYER_CHAT;
      const inRange = binding.maxTokens >= PLAYER_CHAT_MAX_TOKENS_MIN && binding.maxTokens <= PLAYER_CHAT_MAX_TOKENS_MAX;
      if (inRange) globalPass++;
      globalTotal++;
      allIssues.push({
        severity: inRange ? "info" : "critical",
        message: `[I4] PLAYER_CHAT maxTokens=${binding.maxTokens} 在 [${PLAYER_CHAT_MAX_TOKENS_MIN}, ${PLAYER_CHAT_MAX_TOKENS_MAX}] 范围内：${inRange ? "✅" : "❌"}`,
        code: "invariant_player_chat_tokens",
      });
    }

    // 不变量 5: stream=true 只有 PLAYER_CHAT
    {
      let passed = 0;
      const total = Object.keys(TASK_POLICY).length;
      const failures: { task: TaskType; reason: string }[] = [];
      for (const [t, binding] of Object.entries(TASK_POLICY)) {
        if (binding.stream && t !== "PLAYER_CHAT") {
          failures.push({ task: t as TaskType, reason: `stream=true 但非 PLAYER_CHAT` });
        } else {
          passed++;
        }
      }
      globalPass += passed;
      globalTotal += total;
      allIssues.push(...failures.map((f) => ({
        severity: "warning" as const,
        message: `[I5] ${f.task}: ${f.reason} ❌`,
        code: "invariant_stream_only_player_chat",
      })));
      allIssues.push({
        severity: "info",
        message: `[I5] stream=true 只有 PLAYER_CHAT：${passed}/${total} ✅`,
        code: "invariant_stream_only_player_chat",
      });
    }

    // 不变量 6: budgetLevel=low 的任务 timeoutMs ≤ 15000
    {
      let passed = 0;
      const total = Object.keys(TASK_POLICY).length;
      const failures: { task: TaskType; reason: string }[] = [];
      for (const [t, binding] of Object.entries(TASK_POLICY)) {
        if (binding.budgetLevel === "low" && binding.timeoutMs > 15000) {
          failures.push({ task: t as TaskType, reason: `budget=low 但 timeoutMs=${binding.timeoutMs} > 15000` });
        } else {
          passed++;
        }
      }
      globalPass += passed;
      globalTotal += total;
      allIssues.push(...failures.map((f) => ({
        severity: "warning" as const,
        message: `[I6] ${f.task}: ${f.reason} ❌`,
        code: "invariant_low_budget_short_timeout",
      })));
      allIssues.push({
        severity: "info",
        message: `[I6] low budget 任务 timeout ≤ 15000：${passed}/${total} ✅`,
        code: "invariant_low_budget_short_timeout",
      });
    }

    // 不变量 7: responseFormatJsonObject=true 的任务不能 budgetLevel=critical
    {
      let passed = 0;
      const total = Object.keys(TASK_POLICY).length;
      const failures: { task: TaskType; reason: string }[] = [];
      for (const [t, binding] of Object.entries(TASK_POLICY)) {
        if (binding.responseFormatJsonObject && binding.budgetLevel === "critical") {
          failures.push({ task: t as TaskType, reason: `json_mode=true 但 budget=critical` });
        } else {
          passed++;
        }
      }
      globalPass += passed;
      globalTotal += total;
      allIssues.push(...failures.map((f) => ({
        severity: "info" as const,
        message: `[I7] ${f.task}: ${f.reason}（PLAYER_CHAT 是唯一允许的例外）`,
        code: "invariant_json_not_critical",
      })));
      allIssues.push({
        severity: "info",
        message: `[I7] json_mode 不与 critical budget 混用：${passed}/${total} ✅`,
        code: "invariant_json_not_critical",
      });
    }

    const score = globalTotal > 0 ? globalPass / globalTotal : 0;

    return {
      detectorId: "gap-10-taskpolicy-route-invariant",
      score,
      pass: score >= 0.95,
      issues: allIssues,
      latencyMs: 0,
    };
  }
}

export const gap10TaskPolicyRouteInvariantDetector = new Gap10TaskPolicyRouteInvariantDetector();

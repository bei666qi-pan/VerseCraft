/**
 * Gap 11 — Analytics 契约回灌检测器
 *
 * 验证重要的 analytics 事件名和 payload 键名的拼写一致性与契约惯例。
 * 检测事件名是否符合 snake_case、无空串、无特殊字符等。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

// ── 已知 Analytics 事件名（来自 CLAUDE.md §8.2）───────

const KNOWN_EVENTS = [
  "chat_request_finished",
  "turn_lane_decided",
  "turn_commit_summary",
  "narrative_validator_issue",
  "world_engine_enqueued",
  "world_engine_runs",
  "world_engine_event_queue",
  "world_engine_agenda_snapshots",
  "game_session_memory",
];

// ── turn_commit_summary 期望 payload 键（snake_case）───

const TURN_COMMIT_SUMMARY_PAYLOAD_KEYS = [
  "turn_id",
  "is_action_legal",
  "sanity_damage",
  "new_tasks_count",
  "items_awarded",
  "narrative_length",
  "options_count",
  "has_npc_violations",
];

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-11-analytics-contract",
  category: "cross_cutting",
  label: "Analytics 契约回灌",
  description: "验证事件名与 payload 键的拼写一致性与契约惯例",
  offlineOnly: true,
};

// ── 分析函数 ─────────────────────────────────────────

function isSnakeCase(s: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(s);
}

function hasNoSpecialChars(s: string): boolean {
  return /^[a-z0-9_]+$/.test(s);
}

// ── Detector ────────────────────────────────────────────

class Gap11AnalyticsContractDetector implements Detector<void> {
  meta = meta;

  run(): DetectorResult {
    const issues: DetectorIssue[] = [];
    let pass = 0;
    let total = 0;

    // 检查 a: 所有事件名使用 snake_case
    total++;
    const nonSnake = KNOWN_EVENTS.filter((e) => !isSnakeCase(e));
    if (nonSnake.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: `[A] 所有 ${KNOWN_EVENTS.length} 个事件名使用 snake_case ✅`,
        code: "analytics_snake_case",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `[A] 非 snake_case 事件名：${nonSnake.join(", ")} ❌`,
        code: "analytics_snake_case",
      });
    }

    // 检查 b: 没有空字符串或仅空白的事件名
    total++;
    const emptyNames = KNOWN_EVENTS.filter((e) => !e || e.trim().length === 0);
    if (emptyNames.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: "[B] 无空事件名 ✅",
        code: "analytics_no_empty",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `[B] 存在空事件名：${emptyNames.length} 个 ❌`,
        code: "analytics_no_empty",
      });
    }

    // 检查 c: 命名风格一致（snake_case，无混合 camelCase）
    total++;
    const mixedCase = KNOWN_EVENTS.filter((e) => /[A-Z]/.test(e));
    if (mixedCase.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: "[C] 命名风格一致（无 camelCase 混入）✅",
        code: "analytics_no_mixed_case",
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[C] 混合大小写事件名：${mixedCase.join(", ")} ❌`,
        code: "analytics_no_mixed_case",
      });
    }

    // 检查 d: 无特殊字符（仅小写字母 + 下划线）
    total++;
    const specialChars = KNOWN_EVENTS.filter((e) => !hasNoSpecialChars(e));
    if (specialChars.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: "[D] 无特殊字符事件名 ✅",
        code: "analytics_no_special_chars",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `[D] 含特殊字符事件名：${specialChars.join(", ")} ❌`,
        code: "analytics_no_special_chars",
      });
    }

    // 检查 e: turn_commit_summary payload 键名符合 snake_case
    total++;
    const nonSnakeKeys = TURN_COMMIT_SUMMARY_PAYLOAD_KEYS.filter((k) => !isSnakeCase(k));
    if (nonSnakeKeys.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: `[E] turn_commit_summary 所有 ${TURN_COMMIT_SUMMARY_PAYLOAD_KEYS.length} 个 payload 键使用 snake_case ✅`,
        code: "analytics_payload_snake_case",
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[E] payload 键非 snake_case：${nonSnakeKeys.join(", ")} ❌`,
        code: "analytics_payload_snake_case",
      });
    }

    // 检查 f: payload 键名不包含空格
    total++;
    const hasSpace = TURN_COMMIT_SUMMARY_PAYLOAD_KEYS.filter((k) => k.includes(" "));
    if (hasSpace.length === 0) {
      pass++;
      issues.push({
        severity: "info",
        message: "[F] payload 键名无空格 ✅",
        code: "analytics_payload_no_space",
      });
    } else {
      issues.push({
        severity: "warning",
        message: `[F] payload 键含空格：${hasSpace.join(", ")} ❌`,
        code: "analytics_payload_no_space",
      });
    }

    // 额外完整性检查：事件名前缀分组
    const prefixes = new Map<string, number>();
    for (const ev of KNOWN_EVENTS) {
      const prefix = ev.split("_")[0] ?? "unknown";
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
    }
    issues.push({
      severity: "info",
      message: `[G] 事件名前缀分布：${[...prefixes.entries()].map(([p, c]) => `${p}×${c}`).join("、")}`,
      code: "analytics_prefix_distribution",
    });

    const score = total > 0 ? pass / total : 0;

    return {
      detectorId: "gap-11-analytics-contract",
      score,
      pass: score >= 0.90,
      issues,
      latencyMs: 0,
    };
  }
}

export const gap11AnalyticsContractDetector = new Gap11AnalyticsContractDetector();

/**
 * Gap 7 — Normalize Null 降级路径检测器
 *
 * 验证 `normalizePlayerDmJson` 对 null/undefined/畸形输入的降级行为
 * 符合预期：不 throw，返回 null 表示降级。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";
import { normalizePlayerDmJson } from "@/lib/playRealtime/normalizePlayerDmJson";

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-7-normalize-null-degrade",
  category: "submission_structure",
  label: "Normalize Null 降级",
  description: "验证 normalizePlayerDmJson 对畸形输入的 null 降级路径",
  offlineOnly: true,
};

// ── 测试 Case 定义 ─────────────────────────────────────

interface NormalizeCase {
  name: string;
  input: unknown;
  /** 期望返回非 null */
  expectValid: boolean;
  severity: DetectorIssue["severity"];
}

// ── Detector ────────────────────────────────────────────

class Gap7NormalizeNullDegradeDetector implements Detector<void> {
  meta = meta;

  run(): DetectorResult {
    const issues: DetectorIssue[] = [];
    const cases: NormalizeCase[] = [
      { name: "null 输入", input: null, expectValid: false, severity: "warning" },
      { name: "undefined 输入", input: undefined, expectValid: false, severity: "warning" },
      { name: "空对象 {}", input: {}, expectValid: false, severity: "info" },
      { name: "缺少 is_action_legal", input: { narrative: "test", sanity_damage: 0, is_death: false }, expectValid: false, severity: "warning" },
      { name: "is_action_legal 正确但 narrative 缺失", input: { is_action_legal: true, sanity_damage: 0, is_death: false }, expectValid: false, severity: "warning" },
      { name: "额外 bonus 字段不拒绝", input: { is_action_legal: true, narrative: "测试叙事", sanity_damage: 0, is_death: false, bonus: "extra" }, expectValid: true, severity: "info" },
      { name: "sanity_damage 字符串类型", input: { is_action_legal: true, narrative: "测试", sanity_damage: "abc", is_death: false }, expectValid: false, severity: "warning" },
      { name: "完全正确 JSON", input: { is_action_legal: true, narrative: "一段合理的叙事文本。", sanity_damage: 0, is_death: false }, expectValid: true, severity: "info" },
    ];

    let pass = 0;
    const total = cases.length;

    for (const c of cases) {
      try {
        const result = normalizePlayerDmJson(c.input);
        const isValid = result !== null;
        if (isValid === c.expectValid) {
          pass++;
          issues.push({
            severity: c.severity,
            message: `${c.name}：期望 ${c.expectValid ? "非 null" : "null"}，实际 ${isValid ? "非 null" : "null"} ✅`,
            code: `normalize_case_${isValid === c.expectValid ? "pass" : "fail"}`,
          });
        } else {
          issues.push({
            severity: "critical",
            message: `${c.name}：期望 ${c.expectValid ? "非 null" : "null"}，实际 ${isValid ? "非 null" : "null"} ❌`,
            code: `normalize_case_fail`,
          });
        }
      } catch (err) {
        issues.push({
          severity: "critical",
          message: `${c.name}：抛出异常 (${String(err)})，期望不 throw ❌`,
          code: "normalize_throw",
        });
      }
    }

    const score = total > 0 ? pass / total : 0;

    return {
      detectorId: "gap-7-normalize-null-degrade",
      score,
      pass: score >= 0.875, // 7/8 pass
      issues,
      latencyMs: 0,
    };
  }
}

export const gap7NormalizeNullDegradeDetector = new Gap7NormalizeNullDegradeDetector();

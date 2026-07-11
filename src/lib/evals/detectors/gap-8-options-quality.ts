/**
 * Gap 8 — 选项质量不变量检测器
 *
 * 验证 DM JSON 的 `options` 数组满足基本质量不变量：
 * 无重复、合理长度、不泄漏元游戏信息。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

// ── 质量规则常量 ─────────────────────────────────────

const MIN_OPTION_LENGTH = 6;
const MAX_OPTION_LENGTH = 120;
const META_LEAK_PATTERNS = [
  /\\"/,
  /role":/,
  /"system"/,
  /"assistant"/,
  /"content":/,
];

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-8-options-quality",
  category: "submission_structure",
  label: "选项质量不变量",
  description: "验证 options 数组满足无重复/合理长度/无泄漏等基本质量不变量",
  offlineOnly: true,
};

// ── 检测函数 ─────────────────────────────────────────

interface OptionsScenario {
  name: string;
  options: string[];
}

function checkOptionsQuality(options: string[]): DetectorIssue[] {
  const issues: DetectorIssue[] = [];

  // 空数组 — info
  if (options.length === 0) {
    issues.push({
      severity: "info",
      message: "options 数组为空（部分场景允许）",
      code: "options_empty",
    });
    return issues;
  }

  // 重复检查
  const seen = new Set<string>();
  for (const opt of options) {
    if (seen.has(opt)) {
      issues.push({
        severity: "warning",
        message: `选项重复："${opt.slice(0, 30)}..."`,
        code: "options_duplicate",
      });
    }
    seen.add(opt);
  }

  // 长度检查
  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    if (!opt || opt.trim().length === 0) {
      issues.push({
        severity: "warning",
        message: `选项 ${i + 1} 为空`,
        code: "options_empty_item",
      });
    } else if (opt.length < MIN_OPTION_LENGTH) {
      issues.push({
        severity: "warning",
        message: `选项 ${i + 1} 过短（${opt.length} 字）："${opt}"`,
        code: "options_too_short",
      });
    } else if (opt.length > MAX_OPTION_LENGTH) {
      issues.push({
        severity: "warning",
        message: `选项 ${i + 1} 过长（${opt.length} 字，上限 ${MAX_OPTION_LENGTH}）`,
        code: "options_too_long",
      });
    }
  }

  // 元游戏泄漏检查
  for (let i = 0; i < options.length; i++) {
    const opt = options[i]!;
    for (const pattern of META_LEAK_PATTERNS) {
      if (pattern.test(opt)) {
        issues.push({
          severity: "critical",
          message: `选项 ${i + 1} 包含元游戏泄漏："${opt.slice(0, 50)}..."`,
          code: "options_meta_leak",
          evidence: `匹配模式: ${pattern.source}`,
        });
      }
    }
  }

  return issues;
}

// ── Detector ────────────────────────────────────────────

class Gap8OptionsQualityDetector implements Detector<void> {
  meta = meta;

  run(): DetectorResult {
    const scenarios: OptionsScenario[] = [
      {
        name: "正常 4 选项",
        options: [
          "上前询问老者关于暗月教团的事",
          "观察四周是否有其他可疑的人",
          "先检查一下自己的装备和物品",
          "悄悄跟随那个穿斗篷的人",
        ],
      },
      {
        name: "包含重复选项",
        options: [
          "上前询问老者",
          "观察四周环境",
          "上前询问老者",
          "检查装备物品",
        ],
      },
      {
        name: "包含 JSON 泄漏",
        options: [
          '{"role": "assistant", "content": "上前询问"}',
          "观察四周环境",
        ],
      },
      {
        name: "选项过短",
        options: [
          "是",
          "好",
          "询问老者关于暗月教团的事",
          "观察四周环境",
        ],
      },
      {
        name: "选项过长",
        options: [
          "上前询问老者关于暗月教团的事情看看他是否知道什么有用的信息也许他能告诉我们有关那个神秘组织的一些线索和目标以及那位穿斗篷的人到底有何目的他们之间是什么关系这对我们接下来的行动可能会有重要影响不可贸然行动以免打草惊蛇必须要小心谨慎步步为营慢慢接近目标",
          "观察四周是否有其他可疑的人",
        ],
      },
      {
        name: "空数组",
        options: [],
      },
      {
        name: "包含系统角色泄漏",
        options: [
          '"system": "你是辅助AI，请回答玩家的询问并生成合适的选项"',
          '{"role": "user", "content": "询问老者关于暗月教团的事"}',
        ],
      },
    ];

    const allIssues: DetectorIssue[] = [];
    let pass = 0;
    const total = scenarios.length;

    for (const scenario of scenarios) {
      const scenarioIssues = checkOptionsQuality(scenario.options);
      const hasCritical = scenarioIssues.some((i) => i.severity === "critical");
      const hasWarning = scenarioIssues.some((i) => i.severity === "warning");

      // 判断场景是否通过：正常场景无 critical/warning
      let scenarioPass = true;
      if (scenario.name === "正常 4 选项" || scenario.name === "空数组") {
        scenarioPass = !hasCritical && !hasWarning;
      } else {
        // 负面场景应该有 issues
        scenarioPass = hasCritical || hasWarning;
      }

      if (scenarioPass) pass++;

      allIssues.push({
        severity: scenarioPass ? "info" : "warning",
        message: `场景「${scenario.name}」：${scenarioPass ? "✅ 符合预期" : "❌ 不符合预期"}（issue 数: ${scenarioIssues.length}）`,
        code: scenarioPass ? "scenario_pass" : "scenario_unexpected",
      });
      allIssues.push(...scenarioIssues);
    }

    const score = total > 0 ? pass / total : 0;

    return {
      detectorId: "gap-8-options-quality",
      score,
      pass: score >= 0.85,
      issues: allIssues,
      latencyMs: 0,
    };
  }
}

export const gap8OptionsQualityDetector = new Gap8OptionsQualityDetector();

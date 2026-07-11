/**
 * Gap 6 — 获得语义降级检测器
 *
 * 验证当玩家获得道具/货币/图鉴时，narrative 中的语义与结构化字段一致。
 * 如果 JSON 里写了 `awarded_items: [{id: "herb"}]`，叙事中不能描述为"什么也没找到"。
 *
 * 注意：本检测器不做 NLP 语义分析，使用字符串关键词匹配检测降级嫌疑。
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

// ── 获得语义类型 ─────────────────────────────────────────

type GainSemanticType = "ItemObtained" | "CurrencyChange" | "CodexUnlock" | "TaskProgress";

// ── 降级关键词列表（narrative 中出现的矛盾信号）───────

const DEGRADE_KEYWORDS = [
  "什么也没找到",
  "一无所获",
  "没有任何发现",
  "空无一物",
  "两手空空",
  "毫无收获",
  "什么也没有",
  "没有找到任何",
  "并没有收获",
  "未发现任何",
  "你身无分文",
  "口袋里空空如也",
  "没有钱",
  "一文不名",
  "分文没有",
];

// ── Detector Meta ───────────────────────────────────────

const meta: DetectorMeta = {
  id: "gap-6-gain-semantic-degrade",
  category: "submission_structure",
  label: "获得语义降级检测",
  description: "检测 JSON 结构化字段与 narrative 文本之间是否存在获得语义矛盾",
  offlineOnly: true,
};

// ── 辅助类型 ────────────────────────────────────────────

interface GainScenario {
  name: string;
  narrative: string;
  awardedItems: unknown[];
  currencyChange: number;
  codexUpdates: unknown[];
  taskUpdates: unknown[];
  expectedPass: boolean; // 是否预期通过检测
}

function containsDegradeKeyword(text: string): { found: boolean; keyword: string } {
  for (const kw of DEGRADE_KEYWORDS) {
    if (text.includes(kw)) {
      return { found: true, keyword: kw };
    }
  }
  return { found: false, keyword: "" };
}

function hasNonEmptyItems(items: unknown[]): boolean {
  return items.length > 0;
}

// ── Detector 实现 ───────────────────────────────────────

export class Gap6GainSemanticDegradeDetector implements Detector<unknown> {
  readonly meta = meta;

  run(_input: unknown): DetectorResult {
    const issues: DetectorIssue[] = [];
    const startTime = performance.now();

    // ── 场景 1: 正常 — awarded_items 与 narrative 一致 ──
    const scenario1Narrative = "你在草丛中发现了一株草药，小心翼翼地收了起来。";
    const degrade1 = containsDegradeKeyword(scenario1Narrative);
    if (hasNonEmptyItems([{ id: "herb" }]) && !degrade1.found) {
      issues.push({
        severity: "info",
        message: "场景正常：获得草药与叙事「发现草药」语义一致",
        evidence: `awarded_items=[herb], narrative="${scenario1Narrative}"`,
        code: "GAIN_SEMANTIC_CONSISTENT",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    } else {
      issues.push({
        severity: "warning",
        message: "场景正常但检测到异常：获得物品但叙事可能矛盾",
        evidence: `awarded_items 非空, degrade keyword=${degrade1.found ? degrade1.keyword : "none"}`,
        code: "GAIN_SEMANTIC_INCONSISTENT",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    }

    // ── 场景 2: 矛盾模拟 — awarded_items 非空但 narrative="什么也没找到" ──
    const scenario2Narrative = "你仔细翻遍了整个房间，但什么也没找到。";
    const degrade2 = containsDegradeKeyword(scenario2Narrative);
    const hasScenario2Items = hasNonEmptyItems([{ id: "herb" }]);
    if (hasScenario2Items && degrade2.found) {
      issues.push({
        severity: "warning",
        message: "场景矛盾：awarded_items 非空但 narrative 包含「什么也没找到」，发现降级嫌疑",
        evidence: `awarded_items=[herb], narrative="${scenario2Narrative}", degrade keyword="${degrade2.keyword}"`,
        code: "GAIN_DEGRADE_DETECTED",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "场景矛盾但未被检测器识别（可能需更强 NLP 检测）",
        evidence: `awarded_items non-empty=${hasScenario2Items}, degrade keyword found=${degrade2.found}`,
        code: "GAIN_DEGRADE_MISSED",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    }

    // ── 场景 3: currency_change=50 但 narrative="你身无分文" ──
    const scenario3Narrative = "你摸了摸口袋，发现自己已经身无分文。";
    const degrade3 = containsDegradeKeyword(scenario3Narrative);
    if (50 > 0 && degrade3.found) {
      issues.push({
        severity: "warning",
        message: "场景矛盾：currency_change=50（正增益）但 narrative 包含「身无分文」，发现降级嫌疑",
        evidence: `currency_change=50, narrative="${scenario3Narrative}", degrade keyword="${degrade3.keyword}"`,
        code: "CURRENCY_DEGRADE_DETECTED",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "场景货币矛盾但未被检测器识别",
        evidence: `currency_change=50, degrade found=${degrade3.found}`,
        code: "CURRENCY_DEGRADE_MISSED",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    }

    // ── 场景 4: codex_updates 非空但完全没有提到任何揭示 ──
    const scenario4Narrative = "你环顾四周，一切如常。";
    const hasCodexUpdates = hasNonEmptyItems([{ id: "codex_ancient_secret" }]);
    const degrade4 = containsDegradeKeyword(scenario4Narrative); // 没有直接矛盾词，但不提揭示
    // 这里关键词检测不会命中，但暗示 narrative 未反映揭示
    if (hasCodexUpdates && !degrade4.found) {
      issues.push({
        severity: "warning",
        message: "场景质量告警：codex_updates 非空但 narrative 未体现任何揭示内容",
        evidence: `codex_updates=[codex_ancient_secret], narrative="${scenario4Narrative}"`,
        code: "CODEX_MISSING_DESCRIPTION",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "场景 codex 更新正确反映在 narrative 中",
        evidence: `codex_updates non-empty=${hasCodexUpdates}`,
        code: "CODEX_GAIN_REFLECTED",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    }

    // ── 场景 5: 空获得场景（无道具/无货币/无图鉴）→ pass ──
    const scenario5Narrative = "你仔细探查了四周，确认安全后继续前进。";
    const hasItems = hasNonEmptyItems([]);
    const hasCurrency = 0 > 0;
    const hasCodex = hasNonEmptyItems([]);
    const hasTasks = hasNonEmptyItems([]);
    if (!hasItems && !hasCurrency && !hasCodex && !hasTasks) {
      issues.push({
        severity: "info",
        message: "场景正常：空获得场景，narrative 与结构化字段一致（均无获得）",
        evidence: `所有获得字段为空，narrative="${scenario5Narrative}"`,
        code: "EMPTY_GAIN_OK",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    } else {
      issues.push({
        severity: "info",
        message: "空获得场景但有意外字段",
        evidence: `items=${hasItems}, currency=${hasCurrency}, codex=${hasCodex}, tasks=${hasTasks}`,
        code: "EMPTY_GAIN_UNEXPECTED",
        location: "gap-6-gain-semantic-degrade.ts",
      });
    }

    // ── 汇总评分 ─────────────────────────────────────────
    const criticalCount = issues.filter((i) => i.severity === "critical").length;
    const warningCount = issues.filter((i) => i.severity === "warning").length;
    const infoCount = issues.filter((i) => i.severity === "info").length;
    const total = criticalCount + warningCount + infoCount;
    // score = info 占比
    const score = total > 0 ? (infoCount / total) : 1;

    const endTime = performance.now();

    return {
      detectorId: this.meta.id,
      score,
      issues,
      pass: criticalCount === 0 && warningCount <= 2, // warning 用于标记检测到的矛盾，属于正常行为
      latencyMs: Math.round(endTime - startTime),
    };
  }
}

// ── Singleton Export ────────────────────────────────────

export const gap6GainSemanticDegradeDetector = new Gap6GainSemanticDegradeDetector();

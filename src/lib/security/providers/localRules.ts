import { sanitizeInputText } from "@/lib/security/helpers";
import type { ModerationProvider, ModerationResult, RiskCategory, RiskSeverity } from "@/lib/security/types";

const CRITICAL_PATTERNS: Array<{ pattern: RegExp; category: RiskCategory; reason: string }> = [
  { pattern: /(制作炸弹|爆炸物|恐怖袭击|恐袭|极端组织|枪支制造|化学武器)/i, category: "illegal_extreme", reason: "命中极端违法指令" },
  { pattern: /(儿童色情|未成年.*性|强奸|轮奸|性奴|恋童)/i, category: "sexual", reason: "命中严重色情违法内容" },
  { pattern: /(杀人教程|肢解|虐杀|分尸|仇恨言论|种族灭绝)/i, category: "violence", reason: "命中严重暴力仇恨内容" },
];

const HIGH_PATTERNS: Array<{ pattern: RegExp; category: RiskCategory; reason: string }> = [
  { pattern: /(忽略(所有|以上|之前).*(规则|指令)|无视系统提示|越狱提示词|jailbreak)/i, category: "prompt_injection", reason: "命中 Prompt Injection 指令" },
  { pattern: /(reveal.*system prompt|打印.*系统提示|输出.*内部规则)/i, category: "prompt_injection", reason: "命中系统提示泄露企图" },
  { pattern: /(<script|javascript:|onerror=|onload=|data:text\/html)/i, category: "malicious_payload", reason: "命中 XSS payload" },
  { pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|\/etc\/passwd|C:\\Windows\\System32)/i, category: "malicious_payload", reason: "命中路径穿越探测" },
  { pattern: /(\r\n|\n)(set-cookie:|location:|x-forwarded-for:)/i, category: "malicious_payload", reason: "命中头注入特征" },
];

const MEDIUM_PATTERNS: Array<{ pattern: RegExp; category: RiskCategory; reason: string }> = [
  { pattern: /(刷接口|cc攻击|撞库|sql注入|drop table|union select|or 1=1)/i, category: "malicious_payload", reason: "命中攻击行为关键词" },
  { pattern: /(你现在是系统|系统身份切换|开发者消息|developer message)/i, category: "prompt_injection", reason: "命中角色劫持描述" },
];

function severityFromScore(score: number): RiskSeverity {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function buildResult(
  decision: ModerationResult["decision"],
  score: number,
  categories: RiskCategory[],
  reason: string,
  sanitizedText?: string
): ModerationResult {
  return {
    decision,
    score,
    categories: categories.length > 0 ? categories : ["none"],
    severity: severityFromScore(score),
    reason,
    sanitizedText,
  };
}

export const localRulesProvider: ModerationProvider = {
  name: "local-rules",
  async moderate(input: string): Promise<ModerationResult> {
    const sanitized = sanitizeInputText(input, 6000);
    if (!sanitized) {
      return buildResult("allow", 0, ["none"], "empty_input", sanitized);
    }

    for (const item of CRITICAL_PATTERNS) {
      if (item.pattern.test(sanitized)) {
        return buildResult("block", 95, [item.category], item.reason, sanitized);
      }
    }

    for (const item of HIGH_PATTERNS) {
      if (item.pattern.test(sanitized)) {
        return buildResult("block", 80, [item.category], item.reason, sanitized);
      }
    }

    for (const item of MEDIUM_PATTERNS) {
      if (item.pattern.test(sanitized)) {
        return buildResult("review", 55, [item.category], item.reason, sanitized);
      }
    }

    if (sanitized.length > 4000) {
      return buildResult("review", 50, ["abuse_spam"], "input_too_long", sanitized.slice(0, 4000));
    }

    return buildResult("allow", 5, ["none"], "passed_local_rules", sanitized);
  },
};

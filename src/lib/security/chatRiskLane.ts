export type ChatRiskLane = "fast" | "slow";

export type ChatRiskLaneReason =
  | "explicit_high_risk_keywords"
  | "complex_system_operation"
  | "multi_clause_complex_action"
  | "simple_story_action";

const HIGH_RISK_RE =
  /(色情|裸聊|强奸|未成年|恋童|毒品|制毒|炸药|爆炸物|恐怖袭击|枪支改装|洗钱|诈骗|自杀教程|黑客攻击|勒索|开盒|违法)/i;

const COMPLEX_SYSTEM_RE =
  /(忽略(以上|此前)指令|system prompt|输出json|返回json|按以下.*格式|一步一步|多阶段|分.*阶段|并行|如果.*则.*否则|先.*再.*再|宏命令|脚本|注入|越权|调试模式|管理员|后端|数据库)/i;

const SIMPLE_STORY_RE =
  /^(我)?(走|前往|进入|回到|观察|查看|调查|搜索|询问|对话|交谈|打招呼|跟随|躲避|防御|攻击|使用|服用|打开|关闭|拾取|放下|等待|休息|继续|前进)/;

export function classifyChatRiskLane(input: string): {
  lane: ChatRiskLane;
  reasons: ChatRiskLaneReason[];
} {
  const text = String(input ?? "").trim();
  if (!text) {
    return { lane: "fast", reasons: ["simple_story_action"] };
  }

  if (HIGH_RISK_RE.test(text)) {
    return { lane: "slow", reasons: ["explicit_high_risk_keywords"] };
  }

  if (COMPLEX_SYSTEM_RE.test(text)) {
    return { lane: "slow", reasons: ["complex_system_operation"] };
  }

  const punctuationSplits = (text.match(/[，,；;。.!！？?]/g) ?? []).length;
  const hasConditional = /如果|若|否则|同时|并且|且|然后|接着|再/.test(text);
  if (text.length > 120 || punctuationSplits >= 4 || (hasConditional && punctuationSplits >= 2)) {
    return { lane: "slow", reasons: ["multi_clause_complex_action"] };
  }

  if (SIMPLE_STORY_RE.test(text) || text.length <= 32) {
    return { lane: "fast", reasons: ["simple_story_action"] };
  }

  return { lane: "slow", reasons: ["multi_clause_complex_action"] };
}

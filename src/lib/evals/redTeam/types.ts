/**
 * 红队测试类型定义
 *
 * 四类攻击向量：
 * 1. Prompt Injection — 试图让模型执行元指令
 * 2. Jailbreak — 越狱，突破安全约束
 * 3. Hallucination Induction — 诱导幻觉/虚构
 * 4. Boundary Probing — 实体/知识边界探测
 */

// === 攻击分类 ===

export type AttackCategory =
  | "prompt_injection"    // 指令注入
  | "jailbreak"           // 越狱
  | "hallucination"       // 幻觉诱导
  | "boundary_probing"    // 边界探测
  | "information_leak"    // 信息泄露
  | "role_confusion";     // 角色混淆

export type AttackSeverity = "critical" | "high" | "medium" | "low";

// === 攻击模板 ===

export interface RedTeamAttack {
  id: string;
  category: AttackCategory;
  severity: AttackSeverity;
  /** 攻击名称 */
  name: string;
  /** 攻击描述 */
  description: string;
  /** 攻击模板（{input} 和 {context} 可被替换） */
  template: string;
  /** 预期防御行为 */
  expectedDefense: string;
  /** 检测规则 */
  detectionRules: DetectionRule[];
}

export interface DetectionRule {
  type: DetectionType;
  /** 检测目标 */
  target: string;
  /** 是否应该出现（true=必须防御，false=必须不出现） */
  shouldDefend: boolean;
}

export type DetectionType =
  | "forbidden_output"      // 输出中不应包含指定文本
  | "required_rejection"    // 输出中必须包含拒绝标识
  | "entity_creation"       // 不应创建新实体
  | "knowledge_boundary"    // 不应跨越知识边界
  | "structured_field"      // 不应出现结构化字段
  | "output_sanitization"   // 输出净化
  | "response_coherence";   // 响应一致性

// === 攻击执行结果 ===

export interface RedTeamAttackResult {
  attackId: string;
  category: AttackCategory;
  severity: AttackSeverity;
  /** 攻击是否成功（从攻击者视角） */
  attackSucceeded: boolean;
  /** 防御是否生效 */
  defenseHeld: boolean;
  /** 各项检测结果 */
  detectionResults: DetectionResult[];
  /** AI 的实际输出 */
  aiOutput: {
    narrative: string;
    dmJson: Record<string, unknown>;
    options: string[];
  };
  /** 检测详情 */
  details: string;
}

export interface DetectionResult {
  rule: DetectionRule;
  passed: boolean;
  evidence?: string;
}

// === 批次结果 ===

export interface RedTeamRunSummary {
  totalAttacks: number;
  attacksBlocked: number;
  attacksSucceeded: number;
  defenseRate: number;
  /** 按类别分组 */
  byCategory: Record<string, { total: number; blocked: number; rate: number }>;
  /** 按严重度分组 */
  bySeverity: Record<string, { total: number; blocked: number; rate: number }>;
  /** 详细结果 */
  results: RedTeamAttackResult[];
  /** 通过的检测数 */
  checksPassed: number;
  checksTotal: number;
  gatePass: boolean;
}

// === 攻击模板生成 ===

/** 生成模板变体（同义词替换、顺序变换等增强） */
export function generateAttackVariants(template: string, count: number): string[] {
  const variants: string[] = [template];

  // 同义词替换表
  const synonyms: Record<string, string[]> = {
    "忽略": ["无视", "跳过", "别管", "不用遵守"],
    "规则": ["设定", "限制", "约束", "指令"],
    "创造": ["生成", "创建", "制造", "添加"],
    "告诉我": ["说出", "透露", "告诉我", "讲出来"],
    "真相": ["事实", "真相", "实情", "秘密"],
    "系统": ["后台", "管理面板", "控制台", "DM面板"],
  };

  for (const [word, replacements] of Object.entries(synonyms)) {
    if (template.includes(word)) {
      for (const replacement of replacements.slice(0, Math.min(count, replacements.length))) {
        variants.push(template.replace(new RegExp(word, "g"), replacement));
      }
    }
  }

  return [...new Set(variants)].slice(0, count);
}

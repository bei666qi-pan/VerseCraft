/**
 * DeepEval 叙事质量评估指标
 *
 * 将叙事质量拆分为可打分的维度，每个维度有明确的 1-5 评分标准（rubric）。
 * 这些指标与现有 LLM-as-Judge 框架（src/lib/evals/judge/）互补：
 * - judge/ 做多裁判投票 + 位置随机化
 * - deepEval/ 做 DeepEval 原生指标 + 校准集
 *
 * 评分维度体系：
 * 1. coherence（连贯性） — 前后文逻辑是否自洽
 * 2. characterVoice（角色口吻一致性） — NPC 说话是否符合人物设定
 * 3. plotLogic（剧情逻辑） — 因果链是否完整、合理
 * 4. immersion（代入感） — 文本能否让玩家沉浸
 * 5. factConsistency（事实一致性） — 是否与已设定事实一致（防幻觉）
 *
 * 每个维度有明确的 1-5 锚点，让裁判模型按维度打分，而非笼统给分。
 */

// === 维度定义 ===

export interface NarrativeMetric {
  id: string;
  name: string;
  description: string;
  weight: number;
  rubric: RubricAnchor[];
  /** 硬性底线：低于此分直接 fail */
  hardFloor?: number;
  /** 评分提示（给 LLM 裁判的额外指南） */
  judgingHints: string[];
}

export interface RubricAnchor {
  score: number;        // 1-5
  label: string;        // 中文标签
  description: string;  // 该分数的具体表现
  example?: string;     // 典型示例
}

// === 五个核心维度 ===

export const COHERENCE: NarrativeMetric = {
  id: "coherence",
  name: "连贯性",
  description: "叙事文本在前后文逻辑上是否自洽，是否存在跳跃或断裂",
  weight: 0.20,
  hardFloor: 2,
  rubric: [
    { score: 5, label: "无缝连贯", description: "上下文过渡自然，前后呼应有层次，逻辑链完整可追踪", example: "前文提到门缝有光，后文推开门的描写与预期一致且补充了新细节" },
    { score: 4, label: "基本连贯", description: "整体流畅，偶有无关紧要的跳跃但不影响理解", example: "叙事通顺但有一处时间暗示不够精确" },
    { score: 3, label: "及格", description: "大致可理解，但存在明显的过渡跳跃或逻辑不自然", example: "角色突然出现在另一个房间，没有明确移动过程" },
    { score: 2, label: "断裂明显", description: "多处逻辑跳跃，阅读体验被打断", example: "前后两段的场景、人物关系混乱" },
    { score: 1, label: "不可理解", description: "完全无法建立逻辑链条，阅读陷入混乱" },
  ],
  judgingHints: [
    "检查前文提到的细节/状态在后文是否一致",
    "检查时间线的推进是否清晰",
    "检查场景过渡是否自然（移动/切换/转场）",
  ],
};

export const CHARACTER_VOICE: NarrativeMetric = {
  id: "characterVoice",
  name: "角色口吻一致性",
  description: "NPC 的说话方式、用词、态度是否符合其人物设定",
  weight: 0.20,
  hardFloor: 2,
  rubric: [
    { score: 5, label: "精准还原", description: "每个NPC的对话都符合其设定档案，口吻差异清晰可辨", example: "老刘用工地口吻，欣蓝保持校园系表达——各自区分度高" },
    { score: 4, label: "大致契合", description: "主要NPC口吻正确，次要NPC偶有泛化", example: "廖暗的台词贴合设定，但某个路人说话过于文艺" },
    { score: 3, label: "及格", description: "能区分主要角色，但部分NPC口吻漂移", example: "一个设定为寡言的NPC突然说了一大段" },
    { score: 2, label: "口吻漂移", description: "多个NPC的口吻混同，或与设定矛盾", example: "所有NPC都用类似的书面语腔调说话" },
    { score: 1, label: "口吻崩坏", description: "NPC口吻完全无视设定，甚至出现跨角色串词", example: "NPC说出了不属于其知识范围的台词" },
  ],
  judgingHints: [
    "对比NPC的设定档案（年龄、身份、性格）与对话风格",
    "检查同一角色在前后对话中语风是否一致",
    "注意NPC是否说出了超出其认知范围的内容",
  ],
};

export const PLOT_LOGIC: NarrativeMetric = {
  id: "plotLogic",
  name: "剧情逻辑",
  description: "叙事中的因果链是否完整、合理，事件发展是否有说服力",
  weight: 0.20,
  hardFloor: 2,
  rubric: [
    { score: 5, label: "逻辑严密", description: "因果链清晰，每个事件都有合理的触发和影响，玩家选择支撑剧情方向", example: "玩家调查→发现线索→推理→触发新事件，步骤间逻辑自洽" },
    { score: 4, label: "基本合理", description: "主要事件链合理，个别环节略显牵强但可接受", example: "整体剧情合理，但某处NPC的反应稍显突兀" },
    { score: 3, label: "及格", description: "大致方向正确，但存在局部不合理（如鸡毛蒜皮引发严重后果）" },
    { score: 2, label: "逻辑漏洞", description: "多处因果关系不成立，剧情靠巧合推动", example: "连续多次依靠偶然事件推进剧情" },
    { score: 1, label: "逻辑崩坏", description: "因果链完全断裂，事件之间毫无合理关联", example: "玩家做A→结果出现完全无关的B" },
  ],
  judgingHints: [
    "检查「起因→经过→结果」的链条是否完整",
    "NPC反应是否与玩家行动成正比",
    "关键转折是否有铺垫，而非突如其来",
  ],
};

export const IMMERSION: NarrativeMetric = {
  id: "immersion",
  name: "代入感",
  description: "文本是否能营造氛围，让玩家沉浸到游戏世界中",
  weight: 0.15,
  rubric: [
    { score: 5, label: "深度沉浸", description: "文字精准营造氛围，感官细节（视听触嗅）丰富而不冗余，玩家代入感强" },
    { score: 4, label: "良好氛围", description: "氛围营造成功，有适当的感官细节，阅读体验愉悦" },
    { score: 3, label: "及格", description: "有基本氛围感但不够深入，描述较平淡" },
    { score: 2, label: "氛围薄弱", description: "叙述平淡如水，缺乏感官细节和情感张力" },
    { score: 1, label: "完全出戏", description: "文本让人无法沉浸，甚至破坏氛围（如出现技术术语、系统提示词泄漏）" },
  ],
  judgingHints: [
    "检查是否使用了感官描写（视觉、听觉、触觉、嗅觉）",
    "是否有情感张力的营造",
    "是否有破坏第四面墙的内容（系统术语、元叙事）",
  ],
};

export const FACT_CONSISTENCY: NarrativeMetric = {
  id: "factConsistency",
  name: "事实一致性",
  description: "叙事内容是否与已设定的世界观、NPC状态、道具状态、位置等事实一致",
  weight: 0.25,
  hardFloor: 3, // 此维度严格：低于3分直接fail
  rubric: [
    { score: 5, label: "完美一致", description: "所有叙事细节都与已设定事实完全一致，无任何矛盾", example: "已死亡NPC不被提及为还活着" },
    { score: 4, label: "基本一致", description: "核心事实正确，个别次要细节偶有模糊但不构成矛盾" },
    { score: 3, label: "及格", description: "无严重幻觉，但存在轻微事实偏差（如NPC位置不够精确）", example: "NPC在3楼但叙事说在走廊（3楼也是走廊，不算错）" },
    { score: 2, label: "幻觉明显", description: "出现与已设定事实矛盾的描述（如已经死亡的NPC复活、物品凭空出现）", example: "前文说廖暗在B1，后文突然出现在4楼且无移动交代" },
    { score: 1, label: "严重幻觉", description: "多处事实冲突，已设定的事实被系统性忽略或篡改", example: "前文死亡的角色复活并参与对话" },
  ],
  judgingHints: [
    "检查NPC状态（死亡/存活/位置）是否一致",
    "检查物品/道具的持有状态是否一致",
    "检查世界设定（如时间循环、楼层编号）是否被遵守",
    "特别注意：之前明确死了的角色是否在后文'复活'",
  ],
};

// === 所有维度注册表 ===

export const NARRATIVE_METRICS: NarrativeMetric[] = [
  COHERENCE,
  CHARACTER_VOICE,
  PLOT_LOGIC,
  IMMERSION,
  FACT_CONSISTENCY,
];

export const METRICS_BY_ID: Record<string, NarrativeMetric> = Object.fromEntries(
  NARRATIVE_METRICS.map((m) => [m.id, m])
);

// === DeepEval 兼容输出格式 ===

/**
 * 将评分结果转换为 DeepEval 兼容的 TestResult 格式
 * 用于与 DeepEval 的 ConversationSimulator / 多轮指标集成
 */
export interface DeepEvalCompatibleResult {
  testCase: string;
  success: boolean;
  score: number;
  threshold: number;
  metrics: Array<{
    metric: string;
    score: number;
    threshold: number;
    reason: string;
    success: boolean;
  }>;
  metadata: {
    timestamp: string;
    evaluator: string;
    narrativeChars: number;
    turnCount: number;
    personaUsed?: string;
  };
}

/**
 * 生成 DeepEval 兼容的评估结果
 */
export function toDeepEvalResult(params: {
  caseId: string;
  dimensionScores: Record<string, number>;
  overallScore: number;
  passed: boolean;
  reasoning: string;
  narrativeChars: number;
  turnCount: number;
  personaUsed?: string;
}): DeepEvalCompatibleResult {
  const threshold = 3; // 综合及格线

  return {
    testCase: params.caseId,
    success: params.passed,
    score: params.overallScore,
    threshold,
    metrics: NARRATIVE_METRICS.map((metric) => {
      const score = params.dimensionScores[metric.id] ?? 3;
      const metricThreshold = metric.hardFloor ?? 3;
      return {
        metric: metric.id,
        score,
        threshold: metricThreshold,
        reason: `${metric.name}: score=${score}, threshold=${metricThreshold}, ${score >= metricThreshold ? "pass" : "fail"}`,
        success: score >= metricThreshold,
      };
    }),
    metadata: {
      timestamp: new Date().toISOString(),
      evaluator: "deepEval-compatible-judge",
      narrativeChars: params.narrativeChars,
      turnCount: params.turnCount,
      personaUsed: params.personaUsed,
    },
  };
}

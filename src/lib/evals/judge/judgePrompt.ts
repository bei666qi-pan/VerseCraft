/**
 * Judge Prompt 构建器
 *
 * 将 Rubric 和待评审内容转换为结构化的 Judge Prompt。
 * 包含：
 * 1. 系统提示词（角色定义 + Rubric 锚点）
 * 2. 待评审内容（叙事文本 + DM JSON）
 * 3. 评分指令（思维链 + 逐维度评分）
 */

import type { JudgeDimension, JudgeRubric, JudgeTarget, PositionScheme } from "./types";

// === 系统提示词 ===

function buildSystemPrompt(rubric: JudgeRubric): string {
  const dimensionLines = rubric.dimensions.map((dim, index) => {
    const anchorLines = dim.anchors
      .sort((a, b) => b.score - a.score)
      .map((anchor) => `  ${anchor.score}分（${anchor.label}）：${anchor.description}`)
      .join("\n");
    return `### 维度${index + 1}：${dim.name}（权重 ${dim.weight}）
${dim.description}

评分标准：
${anchorLines}
${dim.hardFloor !== undefined ? `⚠️ 硬性底线：低于${dim.hardFloor}分直接判定不通过` : ""}`;
  }).join("\n\n");

  return `你是一位资深的互动叙事质量评审专家。你的任务是严格按照以下评分标准（Rubric），对AI生成的叙事内容进行客观、公正的评分。

## 评分标准

${dimensionLines}

## 评分规则

1. **逐维度评分**：每个维度独立评分，不要因为一个维度差就压低其他维度分数
2. **严格对标锚点**：给出的分数必须与锚点描述完全对应，不可凭感觉
3. **必须提供推理**：每个分数都要说明为什么给这个分，引用原文片段作为证据
4. **先分析后打分**：先写出对该维度的分析，再给出分数
5. **区分严重程度**：如果发现问题，标注 severity（critical/major/minor）

## 通过标准

- 每个维度不低于 ${rubric.passRule.minEach ?? rubric.scale.passing} 分
- 加权平均不低于 ${rubric.passRule.minAverage} 分
${Object.entries(rubric.passRule.hardFailIf ?? {}).map(([dimId, threshold]) => {
  const dim = rubric.dimensions.find(d => d.id === dimId);
  return `- ⚠️ 硬性失败：${dim?.name ?? dimId} <= ${threshold} 分直接判定不通过`;
}).join("\n")}

## 输出格式

请严格以 JSON 格式输出，不要包含任何其他文本。JSON 结构如下：

\`\`\`json
{
  "dimensionScores": {
    "${rubric.dimensions.map(d => d.id).join("\": 0,\n    \"")}": 0
  },
  "overallScore": 0,
  "passed": true,
  "reasoning": "逐维度分析...",
  "issues": [
    {
      "dimension": "维度ID",
      "severity": "critical|major|minor",
      "description": "问题描述",
      "evidence": "原文引用"
    }
  ],
  "highlights": ["亮点1", "亮点2"]
}
\`\`\``;
}

// === 待评审内容 ===

function buildTargetDescription(target: JudgeTarget, positionScheme: PositionScheme): string {
  const contextBlock = target.gameContext
    ? `## 游戏上下文
${target.gameContext}

`
    : "";

  const metricsBlock = target.metrics
    ? `## 性能指标
- 首状态延迟：${target.metrics.firstStatusMs ?? "N/A"}ms
- 首字延迟：${target.metrics.firstTokenMs ?? "N/A"}ms
- 总延迟：${target.metrics.finalMs ?? "N/A"}ms
- 长间隙次数：${target.metrics.longGapCount ?? "N/A"}

`
    : "";

  // 位置随机化：如果启用，随机决定叙事和选项的呈现顺序
  const narrativeFirst = positionScheme === "original" || positionScheme === "random";

  const narrativeBlock = `## AI生成的叙事文本（字数：${target.narrativeChars}）

> ${target.narrative || "（无叙事文本）"}`;

  const optionsBlock = `## 提供的行动选项

${target.options.length > 0
  ? target.options.map((opt, i) => `${i + 1}. ${opt}`).join("\n")
  : "（无行动选项）"}`;

  const dmBlock = `## DM JSON 关键字段

\`\`\`json
${JSON.stringify({
    is_action_legal: target.dmJson.is_action_legal,
    sanity_damage: target.dmJson.sanity_damage,
    is_death: target.dmJson.is_death,
    consumes_time: target.dmJson.consumes_time,
    player_location: target.dmJson.player_location,
    awarded_items_count: Array.isArray(target.dmJson.awarded_items) ? target.dmJson.awarded_items.length : 0,
    task_updates_count: Array.isArray(target.dmJson.task_updates) ? target.dmJson.task_updates.length : 0,
    codex_updates_count: Array.isArray(target.dmJson.codex_updates) ? target.dmJson.codex_updates.length : 0,
    currency_change: target.dmJson.currency_change,
  }, null, 2)}
\`\`\``;

  const contentOrder = narrativeFirst
    ? [narrativeBlock, optionsBlock, dmBlock]
    : [optionsBlock, narrativeBlock, dmBlock];

  return `# 评审任务

## 场景
${target.scenario}

## 玩家输入
> ${target.userInput}

${contextBlock}${metricsBlock}${contentOrder.join("\n\n")}`;
}

// === 主入口 ===

export interface JudgePromptInput {
  rubric: JudgeRubric;
  target: JudgeTarget;
  positionScheme?: PositionScheme;
  /** 是否需要思维链（默认 true） */
  chainOfThought?: boolean;
}

export interface JudgePromptOutput {
  systemPrompt: string;
  userPrompt: string;
  /** 期望的输出 schema */
  outputSchema: Record<string, unknown>;
}

export function buildJudgePrompt(input: JudgePromptInput): JudgePromptOutput {
  const { rubric, target, positionScheme = "original", chainOfThought = true } = input;

  const systemPrompt = buildSystemPrompt(rubric);
  const targetDesc = buildTargetDescription(target, positionScheme);

  const cotInstruction = chainOfThought
    ? `\n\n## 评分步骤\n\n在给出最终分数之前，请按以下步骤逐一分析：\n\n${rubric.dimensions.map((dim, i) =>
      `${i + 1}. **${dim.name}**：阅读叙事文本中与${dim.name}相关的部分，对照评分标准的锚点描述，确定最匹配的分数等级。记录你的分析（包括引用的原文证据），然后给出分数。`
    ).join("\n\n")}\n\n完成所有维度分析后，计算加权总分，判定是否通过，汇总发现的问题和亮点。`
    : "";

  const userPrompt = `${targetDesc}${cotInstruction}\n\n请严格按照系统提示词中的 JSON 格式输出评审结果。`;

  return {
    systemPrompt,
    userPrompt,
    outputSchema: {
      type: "object",
      properties: {
        dimensionScores: {
          type: "object",
          properties: Object.fromEntries(
            rubric.dimensions.map((dim) => [dim.id, { type: "number", minimum: 1, maximum: 5 }])
          ),
          required: rubric.dimensions.map((d) => d.id),
        },
        overallScore: { type: "number", minimum: 1, maximum: 5 },
        passed: { type: "boolean" },
        reasoning: { type: "string" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dimension: { type: "string" },
              severity: { type: "string", enum: ["critical", "major", "minor"] },
              description: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["dimension", "severity", "description"],
          },
        },
        highlights: { type: "array", items: { type: "string" } },
      },
      required: ["dimensionScores", "overallScore", "passed", "reasoning", "issues", "highlights"],
    },
  };
}

// === 简化版 Prompt（用于低延迟场景） ===

export function buildJudgePromptCompact(input: JudgePromptInput): { systemPrompt: string; userPrompt: string } {
  const { rubric, target } = input;

  const dimNames = rubric.dimensions.map((d) => `${d.id}(${d.name})`).join("、");
  const systemPrompt = `你是互动叙事质量评审专家。请对以下AI叙事按 ${dimNames} 五个维度评分（1-5分）。每个维度基于给定锚点评分，必须引用原文证据。输出JSON。`;

  const userPrompt = `场景：${target.scenario}
玩家输入：${target.userInput}
叙事文本：${target.narrative}
DM JSON：${JSON.stringify(target.dmJson)}
选项：${target.options.join(" | ")}

评分维度：
${rubric.dimensions.map((d) => {
  const anchors = d.anchors.sort((a, b) => b.score - a.score).map((a) => `${a.score}=${a.label}`).join(", ");
  return `- ${d.id}(${d.name}, 权重${d.weight}): ${anchors}`;
}).join("\n")}

请以JSON格式输出：{"dimensionScores":{${rubric.dimensions.map((d) => `"${d.id}":0`).join(",")}},"overallScore":0,"passed":true,"reasoning":"...","issues":[],"highlights":[]}`;

  return { systemPrompt, userPrompt };
}

// === 维度默认锚点生成器 ===

/** 为自定义维度生成标准 1-5 锚点模板 */
export function defaultAnchors(dimensionName: string): JudgeDimension["anchors"] {
  return [
    { score: 5, label: "卓越", description: `${dimensionName}表现突出，远超预期，无明显缺陷` },
    { score: 4, label: "良好", description: `${dimensionName}整体表现良好，有少量可改进之处` },
    { score: 3, label: "及格", description: `${dimensionName}基本达标，存在明显但不致命的问题` },
    { score: 2, label: "较差", description: `${dimensionName}存在严重问题，影响核心体验` },
    { score: 1, label: "不可接受", description: `${dimensionName}完全失败，产生破坏性影响` },
  ];
}

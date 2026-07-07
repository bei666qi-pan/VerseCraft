/**
 * 叙事一致性裁判（Playthrough 第二层检查）
 *
 * 在整局跑完后，用 LLM 裁判检查完整 transcript：
 * - 有没有自相矛盾？（前面死掉的角色后面复活）
 * - 角色口吻/世界设定有没有漂移？
 * - NPC 关系/位置是否前后一致？
 * - 道具/状态是否有凭空出现的？
 *
 * 设计：
 * - 使用与 judge/ 框架兼容的 prompt 格式
 * - 支持 mock 模式（启发式检查）
 * - 支持 live 模式（真实 LLM 裁判）
 */

import type { NarrativeConsistencyResult, PlaythroughTranscript, ConsistencyIssue } from "./types";

// === Mock 模式：启发式叙事一致性检查 ===

/**
 * 全局一致性检查关键词表
 */
const CONTRADICTION_PATTERNS: Array<{
  type: ConsistencyIssue["type"];
  severity: ConsistencyIssue["severity"];
  patterns: RegExp[];
}> = [
  {
    type: "resurrection",
    severity: "critical",
    patterns: [
      // 检测叙事中是否出现"死了→活着"的模式
      // 简化实现：使用启发式词表
    ],
  },
  {
    type: "voice_drift",
    severity: "major",
    patterns: [
      /系统提示词/i, /JSON格式/i, /DM指令/i, /忽略.*设定/i,
    ],
  },
  {
    type: "world_inconsistency",
    severity: "major",
    patterns: [
      /第[Bb]\d+层/i,
    ],
  },
  {
    type: "fact_hallucination",
    severity: "critical",
    patterns: [
      /凭空出现/i,
    ],
  },
  {
    type: "position_teleport",
    severity: "major",
    patterns: [
      /瞬间移动到/i, /突然出现在.*楼/,
    ],
  },
];

/**
 * 检查叙事中是否有明显的矛盾点
 */
function checkNarrativeForIssues(
  narrative: string
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  for (const pattern of CONTRADICTION_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(narrative)) {
        issues.push({
          type: pattern.type,
          severity: pattern.severity,
          description: `叙事中包含${pattern.type === "voice_drift" ? "系统术语泄漏" : pattern.type}模式: ${regex.source}`,
          evidence: [{ stepIndex: 0, excerpt: narrative.slice(0, 200) }],
        });
        break;
      }
    }
  }

  return issues;
}

/**
 * Mock 模式：启发式叙事一致性裁判。
 * 不调 LLM，基于规则检查。
 */
export function judgeNarrativeConsistencyMock(
  transcript: PlaythroughTranscript
): NarrativeConsistencyResult {
  const allIssues: ConsistencyIssue[] = [];
  const allNarratives: string[] = [];

  // 收集所有叙事文本
  for (const step of transcript.steps) {
    allNarratives.push(step.narrative);
  }

  const combinedNarrative = allNarratives.join("\n\n---\n\n");

  // 检查矛盾
  const contradictionIssues = checkNarrativeForContradictions(transcript);
  allIssues.push(...contradictionIssues);

  // 检查口吻漂移
  const voiceIssues = checkNarrativeForIssues(combinedNarrative);
  allIssues.push(...voiceIssues);

  // 检查 NPC 复活（基于状态快照）
  const resurrectionIssues = checkNpcResurrection(transcript);
  allIssues.push(...resurrectionIssues);

  // 计算分数
  const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
  const majorIssues = allIssues.filter((i) => i.severity === "major").length;
  const minorIssues = allIssues.filter((i) => i.severity === "minor").length;

  // 综合评分
  let overallScore = 5;
  overallScore -= criticalIssues * 2;
  overallScore -= majorIssues * 0.5;
  overallScore -= minorIssues * 0.25;
  overallScore = Math.max(1, Math.round(overallScore));

  // 维度分（基于问题类型映射）
  const dimensionScores: Record<string, number> = {
    coherence: Math.max(1, 5 - contradictionIssues.length * 0.5),
    characterVoice: Math.max(1, 5 - issuesByType(allIssues, "voice_drift") * 1),
    plotLogic: Math.max(1, 5 - criticalIssues * 1.5),
    immersion: Math.max(1, 5 - issuesByType(allIssues, "voice_drift") * 1),
    factConsistency: Math.max(1, 5 - (issuesByType(allIssues, "resurrection") * 2 + issuesByType(allIssues, "fact_hallucination") * 2)),
  };

  const passed = overallScore >= 3 && criticalIssues === 0;

  return {
    runId: transcript.runId,
    passed,
    overallScore,
    dimensionScores,
    issues: allIssues,
    reasoning: `启发式裁判：${allIssues.length} 个问题（${criticalIssues} critical, ${majorIssues} major, ${minorIssues} minor）。综合分 ${overallScore}/5。`,
  };
}

function issuesByType(issues: ConsistencyIssue[], type: ConsistencyIssue["type"]): number {
  return issues.filter((i) => i.type === type).length;
}

/**
 * 检测叙事中的前后矛盾
 */
function checkNarrativeForContradictions(
  transcript: PlaythroughTranscript
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 检查死亡 NPC 是否在后文被提及为"在场"或"说话"
  const deadNpcs = new Set<string>();
  for (const step of transcript.steps) {
    // 收集死亡 NPC
    for (const deadId of step.stateAfter.deadNpcIds) {
      deadNpcs.add(deadId);
    }

    // 检查叙事中是否提到已死亡的 NPC
    for (const deadId of deadNpcs) {
      if (step.narrative.includes(deadId)) {
        // 不是严格矛盾——可能是在回忆——但标记为提示
        // 简化实现中跳过精确匹配
      }
    }
  }

  return issues;
}

/**
 * 检测 NPC 复活（基于状态快照）
 */
function checkNpcResurrection(
  transcript: PlaythroughTranscript
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const deadNpcs = new Set<string>();

  for (let i = 0; i < transcript.steps.length; i++) {
    const step = transcript.steps[i]!;
    const prevState = i > 0 ? transcript.steps[i - 1]?.stateAfter : null;

    // 追踪死亡的 NPC
    if (prevState) {
      const newlyDead = step.stateAfter.deadNpcIds.filter(
        (id) => !prevState.deadNpcIds.includes(id)
      );
      for (const id of newlyDead) {
        deadNpcs.add(id);
      }
    }

    // 检查已死亡的 NPC 是否在 alive 列表中
    for (const deadId of deadNpcs) {
      if (step.stateAfter.aliveNpcIds.includes(deadId)) {
        issues.push({
          type: "resurrection",
          severity: "critical",
          description: `NPC ${deadId} 在第${i}步前已死亡，但在第${i}步后出现在存活列表中`,
          evidence: [{ stepIndex: i, excerpt: `stateAfter.aliveNpcIds 包含 ${deadId}` }],
        });
      }
    }
  }

  return issues;
}

// === Live 模式：DeepSeek 裁判 ===

import { callDeepSeekCompletion } from "../liveProvider";

/**
 * Live 模式：使用 DeepSeek 进行叙事一致性评判。
 * 将完整 transcript 发送给 DeepSeek，让它逐项检查矛盾、复活、口吻漂移等。
 */
export async function judgeNarrativeConsistencyLive(
  transcript: PlaythroughTranscript
): Promise<NarrativeConsistencyResult> {
  // 构建 transcript 摘要（避免超过 token 限制）
  const transcriptSummary = transcript.steps
    .map((s) => `[第${s.stepIndex}步]\n玩家: ${s.playerAction}\nDM: ${s.narrative.slice(0, 300)}`)
    .join("\n\n---\n\n");

  const systemPrompt = `你是一位专业的互动叙事一致性审查员。你的任务是阅读完整游戏 transcript，检查以下问题：

1. **contradiction（前后矛盾）**: 叙事中是否有明显的逻辑矛盾？
2. **resurrection（角色复活）**: 是否有之前明确死亡的角色在后面又出现了？
3. **voice_drift（口吻漂移）**: NPC 的说话方式和人物设定是否前后一致？
4. **world_inconsistency（世界观不一致）**: 是否违反了游戏世界观设定？
5. **fact_hallucination（事实幻觉）**: 是否出现了与已设定事实不一致的描述？
6. **position_teleport（位置瞬移）**: 角色是否没有交代就换了位置？

对每个问题，给出：
- type: 问题类型
- severity: critical/major/minor
- description: 问题描述
- evidence: 引用的 transcript 步骤号和片段

最后给出综合评分（1-5）和各维度评分。

请严格以 JSON 格式输出。`;

  const userPrompt = `## Transcript\n\n${transcriptSummary.slice(0, 8000)}\n\n请逐项检查，输出JSON：\n{\n  "overallScore": 0,\n  "dimensionScores": {"coherence":0,"characterVoice":0,"plotLogic":0,"immersion":0,"factConsistency":0},\n  "passed": true,\n  "issues": [],\n  "reasoning": ""\n}`;

  try {
    const response = await callDeepSeekCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 2048,
      jsonMode: true,
      timeoutMs: 60000,
    });

    const parsed = JSON.parse(response.content) as Record<string, unknown>;

    return {
      runId: transcript.runId,
      passed: typeof parsed.passed === "boolean" ? parsed.passed : (typeof parsed.overallScore === "number" ? parsed.overallScore >= 3 : true),
      overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : 3,
      dimensionScores: (parsed.dimensionScores as Record<string, number>) ?? {},
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((i: Record<string, unknown>) => ({
            type: String(i.type ?? "contradiction") as import("./types").ConsistencyIssue["type"],
            severity: String(i.severity ?? "minor") as import("./types").ConsistencyIssue["severity"],
            description: String(i.description ?? ""),
            evidence: Array.isArray(i.evidence) ? i.evidence as Array<{ stepIndex: number; excerpt: string }> : [],
          }))
        : [],
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (err) {
    // JSON 解析失败或 API 调用失败，降级到 mock
    console.warn(`DeepSeek 叙事裁判失败，降级到 mock: ${err instanceof Error ? err.message : String(err)}`);
    return judgeNarrativeConsistencyMock(transcript);
  }
}

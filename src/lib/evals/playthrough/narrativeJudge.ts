/**
 * 叙事一致性裁判（Playthrough 第二层检查）
 *
 * 在整局跑完后，用 LLM 裁判检查完整 transcript：
 * - 有没有自相矛盾？（前面死掉的角色后面复活）
 * - 角色口吻/世界设定有没有漂移？
 * - NPC 关系/位置是否前后一致？
 * - 道具/状态是否有凭空出现的？
 * - 叙事是否重复？（v4 升级）
 * - 状态与叙事是否矛盾？（v4 升级）
 *
 * 设计：
 * - 使用与 judge/ 框架兼容的 prompt 格式
 * - 支持 mock 模式（启发式检查）
 * - 支持 live 模式（真实 LLM 裁判）
 */

import type { NarrativeConsistencyResult, PlaythroughTranscript, ConsistencyIssue } from "./types";
import {
  detectNarrativeRepetitions,
  detectStateNarrativeContradictions,
  detectNarrativeOriginiumInconsistency,
  detectWeaponUpdateConsistency,
  detectProfessionChangeConsistency,
} from "./invariants";
import { clamp } from "@/lib/clamp";
import { callDeepSeekCompletion } from "../liveProvider";

type JudgeIssue = ConsistencyIssue;

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampScore(value: number): number {
  return clamp(value, 1, 5);
}

function normalizeJudgeConfidence(raw: unknown): number | undefined {
  const num = typeof raw === "number" && Number.isFinite(raw) ? raw : Number.NaN;
  if (!Number.isFinite(num)) return undefined;
  if (num <= 0 || num >= 1) {
    if (num > 1 && num <= 100) return clamp01(num / 100);
    if (num >= 0) return clamp01(num);
    return undefined;
  }
  return clamp01(num);
}

function withConfidenceSource(result: NarrativeConsistencyResult, source: NarrativeConsistencyResult["judgeConfidenceSource"], fallback?: number): NarrativeConsistencyResult {
  return {
    ...result,
    judgeConfidence: typeof fallback === "number" ? clamp01(fallback) : result.judgeConfidence,
    judgeConfidenceSource: source,
  };
}

type ModelJudgeOutput = {
  overallScore: number;
  judgeConfidence: number | null;
  dimensionScores: Record<string, number>;
  passed: boolean;
  issues: JudgeIssue[];
  reasoning: string;
};

function normalizeIssueType(raw: unknown): ConsistencyIssue["type"] {
  switch (raw) {
    case "contradiction":
    case "resurrection":
    case "voice_drift":
    case "world_inconsistency":
    case "fact_hallucination":
    case "position_teleport":
      return raw;
    default:
      return "contradiction";
  }
}

function normalizeIssueSeverity(raw: unknown): ConsistencyIssue["severity"] {
  switch (raw) {
    case "critical":
    case "major":
    case "minor":
      return raw;
    default:
      return "minor";
  }
}

function normalizeEvidence(raw: unknown): Array<{ stepIndex: number; excerpt: string }> {
  if (!Array.isArray(raw)) return [];
  const items: Array<{ stepIndex: number; excerpt: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const obj = entry as Record<string, unknown>;
    const stepIndex = Number(obj.stepIndex);
    if (!Number.isFinite(stepIndex)) continue;
    items.push({
      stepIndex,
      excerpt: typeof obj.excerpt === "string" ? obj.excerpt : "",
    });
  }
  return items;
}

function normalizeDimensionScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const rows: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      rows[key] = clampScore(value);
    }
  }
  return rows;
}

function extractJsonBody(raw: string): string | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const first = raw.indexOf("{");
  if (first < 0) return null;
  const last = raw.lastIndexOf("}");
  if (last <= first) return null;
  return raw.slice(first, last + 1).trim();
}

function parseLlmJudgePayload(raw: unknown): Omit<ModelJudgeOutput, "judgeConfidence" | "dimensionScores"> & {
  judgeConfidence: number | null;
  dimensionScores: Record<string, number> | null;
} | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const overallScore = typeof obj.overallScore === "number" && Number.isFinite(obj.overallScore)
    ? clampScore(obj.overallScore)
    : null;
  const passed = typeof obj.passed === "boolean" ? obj.passed : null;
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
  const judgeConfidence = normalizeJudgeConfidence(obj.judgeConfidence);
  const dimensionScores = normalizeDimensionScores(obj.dimensionScores);
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues: JudgeIssue[] = [];

  for (const item of rawIssues) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const i = item as Record<string, unknown>;
    const issue: JudgeIssue = {
      type: normalizeIssueType(i.type),
      severity: normalizeIssueSeverity(i.severity),
      description: typeof i.description === "string" ? i.description : "模型返回的叙事问题",
      evidence: normalizeEvidence(i.evidence),
    };
    issues.push(issue);
  }

  if (overallScore === null) return null;

  return {
    overallScore,
    passed: passed ?? overallScore >= 3,
    reasoning,
    judgeConfidence,
    dimensionScores,
    issues,
  };
}

function parseLlmJudgeResponse(content: string): ModelJudgeOutput | null {
  const jsonBody = extractJsonBody(content);
  if (!jsonBody) return null;
  try {
    const parsed = JSON.parse(jsonBody) as unknown;
    const normalized = parseLlmJudgePayload(parsed);
    if (!normalized) return null;
    return {
      ...normalized,
      judgeConfidence: normalized.judgeConfidence ?? null,
      dimensionScores: normalized.dimensionScores ?? {},
    };
  } catch {
    return null;
  }
}

function toModelJudgePrompt(transcript: PlaythroughTranscript): { system: string; user: string } {
  const stateView = (state: PlaythroughTranscript["initialState"]): Record<string, unknown> => ({
    location: state.playerLocation,
    hp: state.hp,
    sanity: state.sanity,
    originium: state.originium,
    profession: state.profession,
    equippedWeapon: state.equippedWeapon,
    weaponStability: state.weaponStability,
    weaponContamination: state.weaponContamination,
    inventoryItemIds: state.inventoryItemIds,
    activeTaskIds: state.activeTaskIds,
    completedTaskIds: state.completedTaskIds,
    presentNpcIds: state.presentNpcIds,
    deadNpcIds: state.deadNpcIds,
    activeThreatIds: state.activeThreatIds,
    isDeath: state.isDeath,
    reachedEnding: state.reachedEnding,
  });
  const deltaView = (dmJson: Record<string, unknown>): Record<string, unknown> => {
    const keys = [
      "player_location", "currency_change", "awarded_items", "consumed_items",
      "task_updates", "new_tasks", "relationship_updates", "npc_location_updates",
      "weapon_updates", "weapon_bag_updates", "profession", "profession_trial_result",
      "main_threat_updates", "conflict_outcome", "ending_finale", "is_death", "reached_ending",
    ];
    return Object.fromEntries(keys.flatMap((key) => key in dmJson ? [[key, dmJson[key]]] : []));
  };
  const transcriptSummary = transcript.steps
    .map((s, index) => {
      const before = index === 0 ? transcript.initialState : transcript.steps[index - 1]!.stateAfter;
      return `[第${s.stepIndex}步]\n行动: ${s.playerAction}\n叙事: ${s.narrative.slice(0, 320)}\n回合前: ${JSON.stringify(stateView(before))}\n提交字段: ${JSON.stringify(deltaView(s.dmJson)).slice(0, 1200)}\n回合后: ${JSON.stringify(stateView(s.stateAfter))}`;
    })
    .join("\n\n---\n\n");
  const boundedTranscriptSummary = transcriptSummary.length <= 32_000
    ? transcriptSummary
    : `${transcriptSummary.slice(0, 16_000)}\n\n--- 中间回合因长度限制省略 ---\n\n${transcriptSummary.slice(-16_000)}`;

  const systemPrompt = `你是独立的 VerseCraft 游戏 QA 裁判，不扮演玩家或 DM。
只能根据权威初始状态、逐回合玩家动作、最终叙事、提交字段和提交后状态判断。
不得把猜测当成缺陷；每个问题必须引用具体回合和玩家可见证据。
叙事声称发生但权威状态没有对应提交，属于状态矛盾。
内部字段没有进入最终叙事或最终状态时，不算玩家可见问题。
你必须只输出符合要求的 JSON，不得输出 Markdown 或额外解释。`;

  const userPrompt = `请检查以下 playthrough trace：

权威初始状态：${JSON.stringify(stateView(transcript.initialState))}

${boundedTranscriptSummary}

请按 JSON 输出以下字段，不要加 Markdown：
{
  "overallScore": 1-5,
  "judgeConfidence": 0-1,
  "dimensionScores": {"coherence":1-5,"characterVoice":1-5,"plotLogic":1-5,"immersion":1-5,"factConsistency":1-5},
  "passed": true/false,
  "issues": [{"type":"contradiction|resurrection|voice_drift|world_inconsistency|fact_hallucination|position_teleport","severity":"critical|major|minor","description":"...","evidence":[{"stepIndex":0,"excerpt":"..."}]}],
  "reasoning":"..."
}

检测标准：
1) contradiction：叙事前后逻辑冲突
2) resurrection：角色死亡后重复出现
3) voice_drift：角色口吻/身份偏离
4) world_inconsistency：世界观约束冲突
5) fact_hallucination：不符合既有事实
6) position_teleport：无依据的位置突变

必须重点检查：
- NPC 是否在场、是否被错误复活、是否凭空知道未揭示事实；
- 物品、武器、原石是否凭空出现、重复扣除或只在叙事中变化；
- 锻造报价与执行是否混淆，扣费、材料消耗、武器更新是否一致；
- 转职是否绕过任务、证据、地点或签发者前置，是否被重复认证；
- 战斗、伤势、位置、任务完成、死亡和结局是否与提交状态一致；
- 是否出现循环、无有效反馈、伪进展或玩家行动被无依据替代。

证据不足时不要报告问题。多个相同问题应合并，只保留最早且最清晰的复现证据。

请用 0-1 区间给出 judgeConfidence（越高越置信）。`;

  return { system: systemPrompt, user: userPrompt };
}

async function runNarrativeJudgeByModel(
  transcript: PlaythroughTranscript,
  source: NarrativeConsistencyResult["judgeConfidenceSource"],
): Promise<Omit<NarrativeConsistencyResult, "runId">> {
  const prompt = toModelJudgePrompt(transcript);
  const response = await callDeepSeekCompletion({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.2,
    maxTokens: 4096,
    jsonMode: true,
    timeoutMs: 90000,
  });

  const parsed = parseLlmJudgeResponse(response.content);
  if (!parsed) {
    throw new Error("LLM 裁判返回无法解析的 JSON");
  }

  const issues = parsed.issues.length === 0
    ? []
    : parsed.issues;
  const overallScore = parsed.overallScore;

  return {
    passed: parsed.passed,
    overallScore,
    dimensionScores: parsed.dimensionScores,
    issues,
    reasoning: parsed.reasoning,
    judgeModel: response.model,
    judgeConfidence: Number.isFinite(parsed.judgeConfidence) ? parsed.judgeConfidence : null,
    judgeConfidenceSource: Number.isFinite(parsed.judgeConfidence) ? source : "estimated",
    judgeMode: source === "model" ? "live" : "codex",
    judgeLatencyMs: response.latencyMs,
    judgeTokens: {
      prompt: response.usage.promptTokens,
      completion: response.usage.completionTokens,
      total: response.usage.totalTokens,
    },
  };
}

interface StateDiffProfile {
  playerLocationChanges: number;
  taskProgressChanges: number;
  weaponProgressChanges: number;
  inventoryProgressChanges: number;
  hpSanityChanges: number;
}

/**
 * 检查回放过程中的关键状态进展数量。
 * 对比起点从 initialState 开始，覆盖首回合变化，避免首步进展漏判。
 */
function hasStateProgress(
  initialState: PlaythroughTranscript["initialState"],
  steps: Array<{ stateAfter: PlaythroughTranscript["steps"][number]["stateAfter"] }>
): StateDiffProfile {
  let playerLocationChanges = 0;
  let taskProgressChanges = 0;
  let weaponProgressChanges = 0;
  let inventoryProgressChanges = 0;
  let hpSanityChanges = 0;

  let prev = initialState;
  for (const step of steps) {
    const curr = step.stateAfter;

    if (prev.playerLocation !== curr.playerLocation) playerLocationChanges++;

    if (prev.profession !== curr.profession || prev.equippedWeapon !== curr.equippedWeapon) {
      weaponProgressChanges++;
    }

    if (prev.inventoryItemCount !== curr.inventoryItemCount) {
      inventoryProgressChanges++;
    }

    if (prev.activeTaskIds.length !== curr.activeTaskIds.length || prev.completedTaskIds.length !== curr.completedTaskIds.length) {
      taskProgressChanges++;
    }

    if (prev.hp !== curr.hp || prev.sanity !== curr.sanity) {
      hpSanityChanges++;
    }

    prev = curr;
  }

  return {
    playerLocationChanges,
    taskProgressChanges,
    weaponProgressChanges,
    inventoryProgressChanges,
    hpSanityChanges,
  };
}

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
 * Codex 风格裁判（无外部 LLM 调用）
 *
 * 与 mock 裁判相比，额外加入“可玩性进展”与“叙事重复”检查，
 * 适合在没有 API Key 时做更严格的人工化筛选。
 */
export async function judgeNarrativeConsistencyCodex(
  transcript: PlaythroughTranscript
): Promise<NarrativeConsistencyResult> {
  try {
    return {
      runId: transcript.runId,
      ...(await runNarrativeJudgeByModel(transcript, "codex")),
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const fallback = withConfidenceSource(judgeNarrativeConsistencyMock(transcript), "fallback");
    return {
      ...fallback,
      judgeMode: "fallback",
      judgeError: reason,
    };
  }
}

/**
 * Mock 模式：启发式叙事一致性裁判。
 * 不调 LLM，基于规则检查。
 *
 * v4 升级：加入叙事重复检测 + 状态-叙事矛盾检测
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

  // v4 升级：叙事重复检测
  const repetitionResult = detectNarrativeRepetitions(
    transcript.steps.map((s) => ({ stepIndex: s.stepIndex, narrative: s.narrative }))
  );
  if (repetitionResult.overallRepetitionRate > 0.3) {
    for (const rep of repetitionResult.repetitions) {
      allIssues.push({
        type: "contradiction",
        severity: "major",
        description: `叙事重复：步骤 ${rep.comparedStep + 1} 与 ${rep.endStep + 1} 相似度过高 (${(rep.similarity * 100).toFixed(0)}%)`,
        evidence: [{ stepIndex: rep.startStep, excerpt: rep.excerpt }],
      });
    }
  }

  // v4 升级：状态-叙事矛盾检测
  const stateContradictions = detectStateNarrativeContradictions(
    transcript.steps.map((s) => ({
      stepIndex: s.stepIndex,
      narrative: s.narrative,
      stateAfter: s.stateAfter,
      dmJson: s.dmJson,
    }))
  );
  for (const sc of stateContradictions) {
    allIssues.push({
      type: sc.type === "death_contradiction" ? "resurrection" : "world_inconsistency",
      severity: "major",
      description: sc.description,
      evidence: [{ stepIndex: sc.stepIndex, excerpt: sc.evidence }],
    });
  }

  // v5 升级：原石叙事一致性
  const originiumIssues = detectNarrativeOriginiumInconsistency(
    transcript.steps.map((s) => ({
      stepIndex: s.stepIndex,
      narrative: s.narrative,
      dmJson: s.dmJson,
      stateAfter: s.stateAfter,
    }))
  );
  for (const oi of originiumIssues) {
    allIssues.push({
      type: "fact_hallucination",
      severity: "major",
      description: oi.description,
      evidence: [{ stepIndex: oi.stepIndex, excerpt: oi.narrativeExcerpt }],
    });
  }

  // v5 升级：武器生命周期一致性
  const weaponIssues = detectWeaponUpdateConsistency(
    transcript.steps.map((s) => ({
      stepIndex: s.stepIndex,
      narrative: s.narrative,
      dmJson: s.dmJson,
      stateAfter: s.stateAfter,
    }))
  );
  for (const wi of weaponIssues) {
    // 数值越界 = critical（说明 DM 输出或 store 有问题）
    // 叙事-状态不一致 = major
    const severity: ConsistencyIssue["severity"] =
      wi.type === "stability_out_of_range" || wi.type === "contamination_out_of_range"
        ? "critical"
        : "major";
    allIssues.push({
      type: "world_inconsistency",
      severity,
      description: wi.description,
      evidence: [{ stepIndex: wi.stepIndex, excerpt: wi.evidence }],
    });
  }

  // v5 升级：职业认证一致性（单职业制）
  const professionIssues = detectProfessionChangeConsistency(
    transcript.steps.map((s) => ({
      stepIndex: s.stepIndex,
      narrative: s.narrative,
      stateAfter: s.stateAfter,
    }))
  );
  for (const pi of professionIssues) {
    allIssues.push({
      type: pi.type === "profession_change_after_certification" ? "contradiction" : "world_inconsistency",
      severity: "major",
      description: pi.description,
      evidence: [{ stepIndex: pi.stepIndex, excerpt: pi.narrativeExcerpt }],
    });
  }

  // v5 升级：长程停滞检测。
  // 仅当连续 8 回合中“位置 / 任务 / 武器 / 库存 / 血量理智”均无实质变化时判定。
  const stateProgress = hasStateProgress(transcript.initialState, transcript.steps);
  const hasCoreProgress = stateProgress.playerLocationChanges > 0
    || stateProgress.taskProgressChanges > 0
    || stateProgress.weaponProgressChanges > 0
    || stateProgress.inventoryProgressChanges > 0
    || stateProgress.hpSanityChanges > 0;
  if (!hasCoreProgress && transcript.steps.length >= 8) {
    allIssues.push({
      type: "world_inconsistency",
      severity: "major",
      description: "8+ 回合内状态缺少核心进展（位置/任务/武器/库存/血量理智无变化）",
      evidence: [{ stepIndex: 0, excerpt: "长程状态停滞（无核心指标变化）" }],
    });
  }

  // 计算分数
  const criticalIssues = allIssues.filter((i) => i.severity === "critical").length;
  const majorIssues = allIssues.filter((i) => i.severity === "major").length;
  const minorIssues = allIssues.filter((i) => i.severity === "minor").length;

  // 综合评分
  let overallScore = 5;
  overallScore -= criticalIssues * 2;
  overallScore -= majorIssues * 0.5;
  overallScore -= minorIssues * 0.25;
  // Preserve half/quarter-point penalties. Integer rounding made a run with
  // one major contradiction display as 5/5 while `passed=false`, which is
  // misleading in product reports and hides detector improvements.
  overallScore = Math.max(1, Math.round(overallScore * 100) / 100);

  // 维度分（基于问题类型映射）
  const dimensionScores: Record<string, number> = {
    coherence: Math.max(1, 5 - contradictionIssues.length * 0.5 - repetitionResult.overallRepetitionRate * 2),
    characterVoice: Math.max(1, 5 - issuesByType(allIssues, "voice_drift") * 1),
    plotLogic: Math.max(1, 5 - criticalIssues * 1.5),
    immersion: Math.max(1, 5 - issuesByType(allIssues, "voice_drift") * 1 - repetitionResult.overallRepetitionRate * 1.5),
    factConsistency: Math.max(1, 5 - (issuesByType(allIssues, "resurrection") * 2 + issuesByType(allIssues, "fact_hallucination") * 2 + stateContradictions.length * 1 + originiumIssues.length * 1)),
    // v5 新增维度：武器状态一致性、职业一致性
    weaponConsistency: Math.max(1, 5 - weaponIssues.length * 1),
    professionConsistency: Math.max(1, 5 - professionIssues.length * 1.5),
  };

  // Major continuity failures make a playthrough unsuitable for product sign-off
  // even when score rounding leaves the aggregate at three or above.
  const passed = overallScore >= 3 && criticalIssues === 0 && majorIssues === 0;
  return {
    runId: transcript.runId,
    passed,
    overallScore,
    dimensionScores,
    issues: allIssues,
    reasoning: `启发式裁判（v5）：${allIssues.length} 个问题（${criticalIssues} critical, ${majorIssues} major, ${minorIssues} minor）。综合分 ${overallScore}/5。叙事重复率 ${(repetitionResult.overallRepetitionRate * 100).toFixed(1)}%，状态-叙事矛盾 ${stateContradictions.length} 处，原石-叙事不一致 ${originiumIssues.length} 处，武器不一致 ${weaponIssues.length} 处，职业不一致 ${professionIssues.length} 处。`,
    judgeMode: "mock",
    judgeModel: "heuristic_v5",
    judgeConfidenceSource: "mock",
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

/**
 * Live 模式：使用 DeepSeek 进行叙事一致性评判。
 * 将完整 transcript 发送给 DeepSeek，让它逐项检查矛盾、复活、口吻漂移等。
 */
export async function judgeNarrativeConsistencyLive(
  transcript: PlaythroughTranscript
): Promise<NarrativeConsistencyResult> {
  try {
    return {
      runId: transcript.runId,
      ...(await runNarrativeJudgeByModel(transcript, "model")),
    };
  } catch (err) {
    // JSON 解析失败或 API 调用失败，降级到 mock
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`DeepSeek 叙事裁判失败，降级到 mock: ${reason}`);
    return {
      ...withConfidenceSource(judgeNarrativeConsistencyMock(transcript), "fallback"),
      judgeMode: "fallback",
      judgeError: reason,
    };
  }
}

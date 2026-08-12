// src/lib/worldEngine/actorSimulation/actorSimulator.ts
/**
 * Phase 3: Bounded Actor Simulation (LLM Call Layer)
 *
 * 接收经过 epistemic filtering 的 ActorSimulationInput[]，
 * 构建 actor-scoped prompt，通过 batch STORYLINE_SIMULATION 调用生成 ActorProjection[]。
 *
 * 设计约束：
 * - 仅运行于 background worker，不进入 /api/chat 等待路径
 * - shadow 模式时只构建 prompt 和 mock projection，不实际调用 LLM
 * - 所有 projection 必须通过 validateActorProjection 纯函数验证
 * - 单个 actor 失败不影响其他 actor
 * - 有界：总 budget、per-actor timeout、max tokens
 */

import type { ChatMessage } from "@/lib/ai/types/core";
import type { AIRequestContext } from "@/lib/ai/types/core";
import { runOfflineReasonerTask } from "@/lib/ai/logicalTasks";
import type { AIResponse, AIErrorResponse } from "@/lib/ai/types";
import {
  resolveActorSimulationFlags,
  isActorSimulationShadow,
} from "./config";
import { clamp } from "@/lib/clamp";
import { validateActorProjection } from "./validateProjection";
import type {
  ActorSimulationInput,
  ActorProjection,
  ActorSimulationTelemetry,
} from "./types";

// ============================================================
// Types
// ============================================================

export interface RunActorSimulationArgs {
  /** 经过 epistemic filtering 的 actor 输入列表 */
  inputs: ActorSimulationInput[];
  /** AI 请求上下文 */
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 注册的 NPC ID 集合 */
  registeredNpcIds?: Set<string>;
  /** 注册的位置 ID 集合 */
  registeredLocationIds?: Set<string>;
  /** telemetry（用于写入结果） */
  telemetry: ActorSimulationTelemetry;
}

export interface ActorSimulationResult {
  /** 成功生成的 projection 列表（已验证通过） */
  projections: ActorProjection[];
  /** 被拒绝的 projection 列表（含拒绝原因） */
  rejectedProjections: Array<{ npcId: string; reason: string }>;
  /** 更新的 telemetry */
  telemetry: ActorSimulationTelemetry;
  /** 供 Director Synthesis 使用的上下文提示 */
  synthesisContextHint: string | null;
}

// ============================================================
// Prompt Building
// ============================================================

/**
 * 构建单个 actor 的 prompt 节。
 * 严格遵循 RUNTIME-PROMPTS.md Actor Simulator 模板。
 */
function buildActorPromptSection(input: ActorSimulationInput): string {
  const lines: string[] = [];

  lines.push(`=== NPC: ${input.npcId} ===`);
  lines.push(`当前位置: ${input.currentLocation}`);
  lines.push(`推演视界: ${input.horizonTurns} 回合`);

  if (input.currentGoal) lines.push(`当前目标: ${input.currentGoal}`);
  if (input.currentFear) lines.push(`当前恐惧: ${input.currentFear}`);
  if (input.currentNeed) lines.push(`当前需求: ${input.currentNeed}`);

  if (input.knownFactIds.length > 0) {
    lines.push(`已知事实 ID: ${input.knownFactIds.join(", ")}`);
  }
  if (input.suspectedFactIds.length > 0) {
    lines.push(`怀疑事实 ID: ${input.suspectedFactIds.join(", ")}`);
  }
  if (input.forbiddenRevealIds.length > 0) {
    lines.push(`禁止泄露: ${input.forbiddenRevealIds.join(", ")}`);
  }

  // 场景公共事实
  if (input.scenePublicFacts.length > 0) {
    lines.push("场景公共事实:");
    for (const fact of input.scenePublicFacts.slice(0, 10)) {
      lines.push(`  - [${fact.id}] ${fact.summary}`);
    }
  }

  // NPC 专属事实
  if (input.actorScopedFacts.length > 0) {
    lines.push(`${input.npcId} 专属事实:`);
    for (const fact of input.actorScopedFacts.slice(0, 10)) {
      lines.push(`  - [${fact.id}] ${fact.summary}`);
    }
  }

  // 关系边
  if (input.relationEdges.length > 0) {
    lines.push("关系:");
    for (const edge of input.relationEdges.slice(0, 5)) {
      lines.push(`  - ${edge.targetNpcId}: ${edge.relationType} (${edge.attitude}, ${edge.intensity})`);
    }
  }

  if (input.personalAgenda) {
    lines.push(`个人议程: ${input.personalAgenda}`);
  }

  lines.push(`模拟 ID: ${input.simulationId}`);
  lines.push("");

  return lines.join("\n");
}

/**
 * 构建 batch actor simulation 的完整 system prompt。
 */
function buildActorSimulationSystemPrompt(inputCount: number, maxActionsPerActor: number): string {
  return [
    "你是 VerseCraft 后台 NPC 行动模拟器。你不是 World Director，不是玩家可见 Writer，也无权提交状态。",
    "",
    "你只能基于输入中明确提供给每个 NPC 的：",
    "- knownFactIds：已知事实",
    "- suspectedFactIds：怀疑事实",
    "- currentGoal / currentFear / currentNeed：驱动",
    "- relationEdges：关系边",
    "- currentLocation：当前位置",
    "- personalAgenda：个人议程",
    "- scenePublicFacts 和 actorScopedFacts",
    "进行未来指定视界内的行动候选推演。",
    "",
    "认知纪律：",
    "- 不在 knownFactIds / actorScopedFacts 中的事实视为不知道",
    "- suspectedFactIds 只能作为怀疑，不能写成事实",
    "- rumor、hypothesis、false_belief 必须保留不确定性",
    "- forbiddenRevealIds 不得出现在任何输出中",
    "- 不得使用其他 NPC 的私有记忆",
    "- 不得因为你作为模型看见世界背景，就让 NPC 知道背景真相",
    "",
    "行动纪律：",
    "- 只提出候选，不得宣告行动已经发生",
    "- 不得决定玩家会做什么",
    "- 不得强制玩家失败、受伤、死亡或失去选择",
    "- 行动必须符合当前位置、能力、关系和资源",
    `- 每个 NPC 最多输出 ${maxActionsPerActor} 个候选行动`,
    "- 没有可信行动时输出 blockedReason",
    "",
    `当前有 ${inputCount} 个 NPC 需要推演。`,
    "",
    "请严格以 JSON 格式输出。输出一个 JSON 对象：",
    '{"projections": [{ "npcId": "...", "intent": "...", "candidateActions": [...], ... }, ...]}',
    "每个 projection 必须包含：npcId, simulationId, knownFactIdsUsed, suspectedFactIdsUsed, intent, candidateActions, mustNotRevealIds, blockedReason(可为null), confidence(0-1)。",
    "candidateActions 每项包含：actionCode, targetNpcIds, targetLocationId, preconditionFactIds, expectedEffectCode, playerAgencyConstraint, confidence(0-1)。",
    "playerAgencyConstraint 必须是以下之一：player_can_ignore_or_avoid, player_can_counteract, player_must_react, observation_only。",
    "如果某个 NPC 无可信行动，blockedReason 填原因，candidateActions 为空数组。",
    "不得输出 Markdown、解释、或其他字段。",
  ].join("\n");
}

/**
 * 构建 batch actor simulation 的 user message。
 */
function buildActorSimulationUserMessage(inputs: ActorSimulationInput[]): string {
  const sections = inputs.map(buildActorPromptSection);
  return sections.join("\n---\n\n");
}

// ============================================================
// Response Parsing
// ============================================================

interface RawProjectionResponse {
  projections?: RawProjection[];
}

interface RawProjection {
  npcId?: string;
  simulationId?: string;
  knownFactIdsUsed?: string[];
  suspectedFactIdsUsed?: string[];
  intent?: string;
  candidateActions?: RawCandidateAction[];
  mustNotRevealIds?: string[];
  blockedReason?: string | null;
  confidence?: number;
}

interface RawCandidateAction {
  actionCode?: string;
  targetNpcIds?: string[];
  targetLocationId?: string | null;
  preconditionFactIds?: string[];
  expectedEffectCode?: string;
  playerAgencyConstraint?: string;
  confidence?: number;
}

/**
 * 解析 LLM 返回的 JSON 为 ActorProjection[]。
 * 对缺失字段做安全默认值处理。
 */
function parseRawProjections(content: string, inputs: ActorSimulationInput[]): ActorProjection[] {
  let parsed: RawProjectionResponse;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  if (!parsed.projections || !Array.isArray(parsed.projections)) {
    return [];
  }

  const inputMap = new Map(inputs.map((i) => [i.npcId, i]));

  return parsed.projections.map((raw, idx): ActorProjection => {
    const input = raw.npcId ? inputMap.get(raw.npcId) : undefined;

    return {
      schemaVersion: "actor_projection_v1",
      simulationId: raw.simulationId ?? input?.simulationId ?? `sim-unknown-${idx}`,
      npcId: raw.npcId ?? input?.npcId ?? `unknown-${idx}`,
      knownFactIdsUsed: raw.knownFactIdsUsed ?? [],
      suspectedFactIdsUsed: raw.suspectedFactIdsUsed ?? [],
      intent: raw.intent ?? "未提供意图",
      candidateActions: (raw.candidateActions ?? []).map((a): ActorProjection["candidateActions"][0] => ({
        actionCode: a.actionCode ?? "unknown_action",
        targetNpcIds: a.targetNpcIds ?? [],
        targetLocationId: a.targetLocationId ?? null,
        preconditionFactIds: a.preconditionFactIds ?? [],
        expectedEffectCode: a.expectedEffectCode ?? "unknown_effect",
        playerAgencyConstraint: validateAgencyConstraint(a.playerAgencyConstraint),
        confidence: clampConfidence(a.confidence),
      })),
      mustNotRevealIds: raw.mustNotRevealIds ?? [],
      blockedReason: raw.blockedReason ?? (raw.candidateActions?.length === 0 ? "未生成行动" : null),
      confidence: clampConfidence(raw.confidence),
    };
  });
}

function validateAgencyConstraint(raw: string | undefined): ActorProjection["candidateActions"][0]["playerAgencyConstraint"] {
  const valid = ["player_can_ignore_or_avoid", "player_can_counteract", "player_must_react", "observation_only"];
  if (raw && valid.includes(raw)) {
    return raw as ActorProjection["candidateActions"][0]["playerAgencyConstraint"];
  }
  return "observation_only"; // safe default
}

function clampConfidence(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) {
    return clamp(v, 0, 1);
  }
  return 0.5;
}

// ============================================================
// Main API
// ============================================================

/**
 * 运行一轮有界 batch actor simulation。
 *
 * shadow 模式：构建 prompt + 返回空 projection，记录 telemetry。
 * soft 模式：实际调用 STORYLINE_SIMULATION LLM，解析 + 验证每个 projection。
 *
 * 所有 projection 在返回前均通过 validateActorProjection 纯函数检查。
 */
export async function runActorSimulation(args: RunActorSimulationArgs): Promise<ActorSimulationResult> {
  const {
    inputs,
    ctx,
    signal,
    registeredNpcIds = new Set(),
    registeredLocationIds = new Set(),
    telemetry,
  } = args;

  const flags = resolveActorSimulationFlags();
  const isShadow = isActorSimulationShadow(flags);

  telemetry.simulationRequested = inputs.length;

  // Shadow 模式：不调用 LLM，返回空结果
  if (isShadow) {
    telemetry.simulationFulfilled = 0;
    telemetry.simulationRejected = 0;
    telemetry.simulationTimedOut = 0;
    return {
      projections: [],
      rejectedProjections: inputs.map((i) => ({ npcId: i.npcId, reason: "shadow_mode" })),
      telemetry,
      synthesisContextHint: null,
    };
  }

  if (inputs.length === 0) {
    telemetry.simulationFulfilled = 0;
    telemetry.simulationRejected = 0;
    telemetry.simulationTimedOut = 0;
    return {
      projections: [],
      rejectedProjections: [],
      telemetry,
      synthesisContextHint: null,
    };
  }

  // 构建 prompt
  const systemPrompt = buildActorSimulationSystemPrompt(inputs.length, flags.maxActionsPerActor);
  const userMessage = buildActorSimulationUserMessage(inputs);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const simStartMs = Date.now();

  // 调用 STORYLINE_SIMULATION
  let result: AIResponse | AIErrorResponse;
  try {
    result = await runOfflineReasonerTask({
      kind: "storyline",
      messages,
      ctx,
      signal,
      requestTimeoutMs: Math.min(flags.totalTickBudgetMs, flags.perActorTimeoutMs * inputs.length),
      skipCache: true,
      devOverrides: {
        responseFormatJsonObject: true,
        temperature: 0.2,
        maxTokens: 2048,
      },
    });
  } catch (err) {
    // 超时或网络错误
    telemetry.simulationTimedOut = inputs.length;
    telemetry.simulationFulfilled = 0;
    telemetry.simulationRejected = inputs.length;
    telemetry.actorSimulationLatencyMs = Date.now() - simStartMs;
    return {
      projections: [],
      rejectedProjections: inputs.map((i) => ({
        npcId: i.npcId,
        reason: err instanceof Error ? `ai_error:${err.message}` : "ai_timeout",
      })),
      telemetry,
      synthesisContextHint: null,
    };
  }

  telemetry.actorSimulationLatencyMs = Date.now() - simStartMs;

  if (!result.ok) {
    telemetry.simulationFulfilled = 0;
    telemetry.simulationRejected = inputs.length;
    return {
      projections: [],
      rejectedProjections: inputs.map((i) => ({ npcId: i.npcId, reason: `ai_error:${result.code}` })),
      telemetry,
      synthesisContextHint: null,
    };
  }

  // 解析 projection
  const rawProjections = parseRawProjections(result.content ?? "", inputs);
  const accepted: ActorProjection[] = [];
  const rejected: Array<{ npcId: string; reason: string }> = [];

  // 建立 allowed facts per NPC
  const allowedFactsByNpc = new Map<string, Set<string>>();
  const forbiddenFactsByNpc = new Map<string, Set<string>>();
  for (const input of inputs) {
    allowedFactsByNpc.set(input.npcId, new Set(input.knownFactIds));
    forbiddenFactsByNpc.set(input.npcId, new Set(input.forbiddenRevealIds));
  }

  for (const projection of rawProjections) {
    const input = inputs.find((i) => i.npcId === projection.npcId);
    const allowedFacts = allowedFactsByNpc.get(projection.npcId) ?? new Set();
    const forbiddenFacts = forbiddenFactsByNpc.get(projection.npcId) ?? new Set();

    // 合并 input 中已有的 mustNotRevealIds
    if (input) {
      for (const id of input.forbiddenRevealIds) {
        forbiddenFacts.add(id);
      }
    }

    const validation = validateActorProjection({
      projection,
      registeredNpcIds,
      allowedKnownFactIds: allowedFacts,
      forbiddenFactIds: forbiddenFacts,
      registeredLocationIds,
    });

    if (validation.accepted) {
      accepted.push(projection);
    } else {
      rejected.push({
        npcId: projection.npcId,
        reason: validation.issues.map((i) => `${i.code}: ${i.detail}`).join("; "),
      });
    }
  }

  telemetry.simulationFulfilled = accepted.length;
  telemetry.simulationRejected = rejected.length;

  // 补齐：LLM 未返回的 input NPC 视为 reject
  const returnedNpcIds = new Set(rawProjections.map((p) => p.npcId));
  for (const input of inputs) {
    if (!returnedNpcIds.has(input.npcId)) {
      rejected.push({ npcId: input.npcId, reason: "no_llm_output" });
      telemetry.simulationRejected++;
    }
  }

  telemetry.projectionAccepted = accepted.length;
  telemetry.projectionRejectedByValidator = rejected.length;

  // 构建合成上下文提示
  const synthesisContextHint = accepted.length > 0 ? buildSynthesisContextHint(accepted) : null;

  return {
    projections: accepted,
    rejectedProjections: rejected,
    telemetry,
    synthesisContextHint,
  };
}

// ============================================================
// Synthesis Context Hint Builder
// ============================================================

function buildSynthesisContextHint(projections: ActorProjection[]): string {
  const lines: string[] = [];
  lines.push("=== Actor Simulation Context (soft mode) ===");
  lines.push(`本 tick ${projections.length} 个 NPC 推演结果：`);

  for (const p of projections) {
    lines.push("");
    lines.push(`NPC ${p.npcId}:`);
    lines.push(`  意图: ${p.intent}`);
    if (p.blockedReason) {
      lines.push(`  状态: 被阻止 (${p.blockedReason})`);
    }
    for (const action of p.candidateActions.slice(0, 3)) {
      lines.push(`  行动: ${action.actionCode} → ${action.expectedEffectCode} (${action.playerAgencyConstraint}, conf=${action.confidence.toFixed(2)})`);
    }
  }

  lines.push("");
  lines.push("请基于以上 NPC 的认知边界和推演结果，在 director_plan_v1 的 npc_next_actions 中生成符合各 NPC 认知的候选行动。");
  lines.push("每个 NPC 只能基于其已知事实行动；不要使用其他 NPC 私有记忆或 dmOnly 事实。");

  return lines.join("\n");
}

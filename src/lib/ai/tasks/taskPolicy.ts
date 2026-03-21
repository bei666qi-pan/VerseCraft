// src/lib/ai/tasks/taskPolicy.ts
/**
 * Single source of truth: task → model roles, limits, and forbidden routes.
 * Debug: use `explainTaskRouting()` or `exportTaskModelMatrixMarkdown()` (dev logs).
 */
import "server-only";

import type { ResolvedAiEnv } from "@/lib/ai/config/env";
import { resolveAiEnv } from "@/lib/ai/config/env";
import type { AllowedModelId } from "@/lib/ai/models/registry";
import type { FallbackPolicy, TaskType } from "@/lib/ai/types/core";

export type BudgetLevel = "low" | "medium" | "high" | "critical";

export interface TaskBinding {
  task: TaskType;
  /** Default first hop when keys exist; env may prepend overrides for MEMORY_COMPRESSION / DEV_ASSIST. */
  primaryModel: AllowedModelId;
  fallbackModels: readonly AllowedModelId[];
  stream: boolean;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  budgetLevel: BudgetLevel;
  responseFormatJsonObject: boolean;
}

const R = "deepseek-reasoner" as const;
const V32 = "deepseek-v3.2" as const;
const GLM = "glm-5-air" as const;
const MMX = "MiniMax-M2.7-highspeed" as const;

/** Canonical per-task defaults (traffic stays on V3.2 unless task explicitly names GLM/MiniMax/Reasoner). */
export const TASK_POLICY: Record<TaskType, TaskBinding> = {
  PLAYER_CHAT: {
    task: "PLAYER_CHAT",
    primaryModel: V32,
    fallbackModels: [GLM],
    stream: true,
    maxTokens: 1536,
    timeoutMs: 60_000,
    budgetLevel: "critical",
    responseFormatJsonObject: true,
  },
  INTENT_PARSE: {
    task: "INTENT_PARSE",
    primaryModel: GLM,
    fallbackModels: [V32],
    stream: false,
    maxTokens: 1024,
    temperature: 0.1,
    timeoutMs: 15_000,
    budgetLevel: "low",
    responseFormatJsonObject: true,
  },
  SAFETY_PREFILTER: {
    task: "SAFETY_PREFILTER",
    primaryModel: GLM,
    fallbackModels: [V32],
    stream: false,
    maxTokens: 512,
    temperature: 0,
    timeoutMs: 10_000,
    budgetLevel: "low",
    responseFormatJsonObject: true,
  },
  RULE_RESOLUTION: {
    task: "RULE_RESOLUTION",
    primaryModel: V32,
    fallbackModels: [GLM],
    stream: false,
    maxTokens: 2048,
    temperature: 0.2,
    timeoutMs: 45_000,
    budgetLevel: "high",
    responseFormatJsonObject: true,
  },
  COMBAT_NARRATION: {
    task: "COMBAT_NARRATION",
    primaryModel: V32,
    fallbackModels: [GLM],
    stream: false,
    maxTokens: 1536,
    temperature: 0.3,
    timeoutMs: 45_000,
    budgetLevel: "high",
    responseFormatJsonObject: true,
  },
  SCENE_ENHANCEMENT: {
    task: "SCENE_ENHANCEMENT",
    primaryModel: MMX,
    fallbackModels: [V32],
    stream: false,
    maxTokens: 800,
    temperature: 0.8,
    timeoutMs: 25_000,
    budgetLevel: "high",
    responseFormatJsonObject: false,
  },
  NPC_EMOTION_POLISH: {
    task: "NPC_EMOTION_POLISH",
    primaryModel: MMX,
    fallbackModels: [V32, GLM],
    stream: false,
    maxTokens: 600,
    temperature: 0.85,
    timeoutMs: 20_000,
    budgetLevel: "high",
    responseFormatJsonObject: false,
  },
  WORLDBUILD_OFFLINE: {
    task: "WORLDBUILD_OFFLINE",
    primaryModel: R,
    fallbackModels: [V32, GLM],
    stream: false,
    maxTokens: 4096,
    temperature: 0.3,
    timeoutMs: 120_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
  STORYLINE_SIMULATION: {
    task: "STORYLINE_SIMULATION",
    primaryModel: R,
    fallbackModels: [V32],
    stream: false,
    maxTokens: 8192,
    temperature: 0.25,
    timeoutMs: 120_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
  DEV_ASSIST: {
    task: "DEV_ASSIST",
    primaryModel: R,
    fallbackModels: [V32, GLM],
    stream: false,
    maxTokens: 4096,
    temperature: 0.2,
    timeoutMs: 90_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
  MEMORY_COMPRESSION: {
    task: "MEMORY_COMPRESSION",
    primaryModel: V32,
    fallbackModels: [R, GLM],
    stream: false,
    maxTokens: 2048,
    timeoutMs: 30_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
};

/** Models that must never run under a given task (enforced before network). */
export const TASK_MODEL_FORBIDDEN: Readonly<Record<TaskType, ReadonlySet<AllowedModelId>>> = {
  PLAYER_CHAT: new Set([R, MMX]),
  INTENT_PARSE: new Set([R, MMX]),
  SAFETY_PREFILTER: new Set([R, MMX]),
  RULE_RESOLUTION: new Set([R, MMX]),
  COMBAT_NARRATION: new Set([R, MMX]),
  SCENE_ENHANCEMENT: new Set([R]),
  NPC_EMOTION_POLISH: new Set([R]),
  WORLDBUILD_OFFLINE: new Set([MMX]),
  STORYLINE_SIMULATION: new Set([MMX]),
  DEV_ASSIST: new Set([MMX]),
  MEMORY_COMPRESSION: new Set([MMX]),
};

export function getTaskBinding(task: TaskType): TaskBinding {
  return TASK_POLICY[task];
}

export function isModelForbiddenForTask(task: TaskType, model: AllowedModelId): boolean {
  return TASK_MODEL_FORBIDDEN[task].has(model);
}

function uniqueModels(ids: readonly AllowedModelId[]): AllowedModelId[] {
  const out: AllowedModelId[] = [];
  const seen = new Set<AllowedModelId>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function filterByConfiguredKeys(chain: AllowedModelId[], env: ResolvedAiEnv): AllowedModelId[] {
  return chain.filter((id) => {
    if (id === V32 || id === R) return env.deepseek.apiKey.length > 0;
    if (id === GLM) return env.zhipu.apiKey.length > 0;
    if (id === MMX) return env.minimax.apiKey.length > 0;
    return false;
  });
}

function applyForbidden(task: TaskType, chain: AllowedModelId[]): AllowedModelId[] {
  return chain.filter((id) => !isModelForbiddenForTask(task, id));
}

/**
 * Builds ordered candidate list: env overrides for PLAYER_CHAT / MEMORY / DEV_ASSIST, then policy order, minus forbidden.
 */
export function resolveOrderedModelChain(task: TaskType, env: ResolvedAiEnv = resolveAiEnv()): AllowedModelId[] {
  const b = getTaskBinding(task);
  let base: AllowedModelId[] = [b.primaryModel, ...b.fallbackModels];

  if (task === "PLAYER_CHAT") {
    base = uniqueModels([b.primaryModel, ...b.fallbackModels, ...env.playerChatFallbackChain]);
  } else if (task === "MEMORY_COMPRESSION") {
    const p = env.memoryCompressionModel;
    base = uniqueModels([p, b.primaryModel, ...b.fallbackModels.filter((x) => x !== p)]);
  } else if (task === "DEV_ASSIST") {
    const p = env.adminInsightModel;
    base = uniqueModels([p, b.primaryModel, ...b.fallbackModels.filter((x) => x !== p)]);
  }

  const allowed = applyForbidden(task, base);
  if (allowed.length < base.length) {
    const dropped = base.filter((id) => !allowed.includes(id));
    console.warn(
      `[ai/taskPolicy] Dropped models for task=${task} (forbidden or duplicate): ${dropped.join(", ") || "(none)"}`
    );
  }
  return filterByConfiguredKeys(allowed, env);
}

export function resolveFallbackPolicy(task: TaskType, env: ResolvedAiEnv = resolveAiEnv()): FallbackPolicy {
  const chain = resolveOrderedModelChain(task, env);
  return {
    chain,
    stopOnFirstSuccess: true,
    tripCircuitOnFailure: true,
  };
}

export interface RoutingTraceLine {
  model: AllowedModelId;
  excluded: boolean;
  reason?: "forbidden" | "no_api_key" | "duplicate";
}

/** For logs / admin debug: why each model was kept or skipped (pre-key filter). */
export function explainTaskRouting(task: TaskType, env: ResolvedAiEnv = resolveAiEnv()): RoutingTraceLine[] {
  const b = getTaskBinding(task);
  let base: AllowedModelId[] = [b.primaryModel, ...b.fallbackModels];
  if (task === "PLAYER_CHAT") {
    base = uniqueModels([b.primaryModel, ...b.fallbackModels, ...env.playerChatFallbackChain]);
  } else if (task === "MEMORY_COMPRESSION") {
    const p = env.memoryCompressionModel;
    base = uniqueModels([p, b.primaryModel, ...b.fallbackModels.filter((x) => x !== p)]);
  } else if (task === "DEV_ASSIST") {
    const p = env.adminInsightModel;
    base = uniqueModels([p, b.primaryModel, ...b.fallbackModels.filter((x) => x !== p)]);
  }

  const seen = new Set<AllowedModelId>();
  const lines: RoutingTraceLine[] = [];
  for (const model of base) {
    if (seen.has(model)) {
      lines.push({ model, excluded: true, reason: "duplicate" });
      continue;
    }
    seen.add(model);
    if (isModelForbiddenForTask(task, model)) {
      lines.push({ model, excluded: true, reason: "forbidden" });
      continue;
    }
    const afterKeys = filterByConfiguredKeys([model], env);
    if (afterKeys.length === 0) {
      lines.push({ model, excluded: true, reason: "no_api_key" });
      continue;
    }
    lines.push({ model, excluded: false });
  }
  return lines;
}

/** Markdown table for docs / copy-paste into runbooks. */
export function exportTaskModelMatrixMarkdown(): string {
  const rows: string[] = [
    "| Task | Primary | Fallbacks | Stream | max_tokens | timeout_ms | budget | json_mode |",
    "|------|---------|-----------|--------|------------|------------|--------|-----------|",
  ];
  for (const t of Object.keys(TASK_POLICY) as TaskType[]) {
    const b = TASK_POLICY[t];
    rows.push(
      `| ${b.task} | ${b.primaryModel} | ${b.fallbackModels.join(", ")} | ${b.stream} | ${b.maxTokens} | ${b.timeoutMs} | ${b.budgetLevel} | ${b.responseFormatJsonObject} |`
    );
  }
  rows.push("", "## Forbidden model × task", "", "| Task | Forbidden models |", "|------|------------------|");
  for (const t of Object.keys(TASK_MODEL_FORBIDDEN) as TaskType[]) {
    const s = [...TASK_MODEL_FORBIDDEN[t]].join(", ");
    rows.push(`| ${t} | ${s} |`);
  }
  return rows.join("\n");
}

export function assertModelAllowedForTask(task: TaskType, modelId: AllowedModelId): void {
  if (isModelForbiddenForTask(task, modelId)) {
    throw new Error(`[ai] Model ${modelId} is forbidden for task ${task}`);
  }
}

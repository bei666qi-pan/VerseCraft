// src/lib/ai/tasks/taskPolicy.ts
/**
 * Single source of truth: task → logical roles, limits, and forbidden routes.
 * Upstream model names are resolved in env (AI_MODEL_*), not here.
 */
import type { ResolvedAiEnv } from "@/lib/ai/config/envCore";
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import { resolveOperationMode, type OperationMode } from "@/lib/ai/degrade/modeCore";
import type { FallbackPolicy, TaskType } from "@/lib/ai/types/core";

export type BudgetLevel = "low" | "medium" | "high" | "critical";

export interface TaskBinding {
  task: TaskType;
  /** First logical role for this task; env may prepend for MEMORY / DEV_ASSIST. */
  primaryRole: AiLogicalRole;
  fallbackRoles: readonly AiLogicalRole[];
  stream: boolean;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  budgetLevel: BudgetLevel;
  responseFormatJsonObject: boolean;
}

const MAIN = "main" as const satisfies AiLogicalRole;
const CONTROL = "control" as const satisfies AiLogicalRole;
const ENHANCE = "enhance" as const satisfies AiLogicalRole;
const REASONER = "reasoner" as const satisfies AiLogicalRole;

export const TASK_POLICY: Record<TaskType, TaskBinding> = {
  PLAYER_CHAT: {
    task: "PLAYER_CHAT",
    primaryRole: MAIN,
    fallbackRoles: [],
    stream: true,
    maxTokens: 896,
    timeoutMs: 60_000,
    budgetLevel: "critical",
    responseFormatJsonObject: true,
  },
  PLAYER_CONTROL_PREFLIGHT: {
    task: "PLAYER_CONTROL_PREFLIGHT",
    primaryRole: CONTROL,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 512,
    temperature: 0,
    timeoutMs: 12_000,
    budgetLevel: "low",
    responseFormatJsonObject: true,
  },
  INTENT_PARSE: {
    task: "INTENT_PARSE",
    primaryRole: CONTROL,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 640,
    temperature: 0.1,
    timeoutMs: 15_000,
    budgetLevel: "low",
    responseFormatJsonObject: true,
  },
  SAFETY_PREFILTER: {
    task: "SAFETY_PREFILTER",
    primaryRole: CONTROL,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 384,
    temperature: 0,
    timeoutMs: 10_000,
    budgetLevel: "low",
    responseFormatJsonObject: true,
  },
  RULE_RESOLUTION: {
    task: "RULE_RESOLUTION",
    primaryRole: MAIN,
    fallbackRoles: [CONTROL],
    stream: false,
    maxTokens: 1792,
    temperature: 0.2,
    timeoutMs: 45_000,
    budgetLevel: "high",
    responseFormatJsonObject: true,
  },
  COMBAT_NARRATION: {
    task: "COMBAT_NARRATION",
    primaryRole: MAIN,
    fallbackRoles: [CONTROL],
    stream: false,
    maxTokens: 1280,
    temperature: 0.3,
    timeoutMs: 45_000,
    budgetLevel: "high",
    responseFormatJsonObject: true,
  },
  SCENE_ENHANCEMENT: {
    task: "SCENE_ENHANCEMENT",
    primaryRole: ENHANCE,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 448,
    temperature: 0.75,
    timeoutMs: 22_000,
    budgetLevel: "high",
    responseFormatJsonObject: false,
  },
  NPC_EMOTION_POLISH: {
    task: "NPC_EMOTION_POLISH",
    primaryRole: ENHANCE,
    fallbackRoles: [MAIN, CONTROL],
    stream: false,
    maxTokens: 384,
    temperature: 0.82,
    timeoutMs: 18_000,
    budgetLevel: "high",
    responseFormatJsonObject: false,
  },
  WORLDBUILD_OFFLINE: {
    task: "WORLDBUILD_OFFLINE",
    primaryRole: REASONER,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 2048,
    temperature: 0.3,
    timeoutMs: 75_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
  STORYLINE_SIMULATION: {
    task: "STORYLINE_SIMULATION",
    primaryRole: REASONER,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 6144,
    temperature: 0.25,
    timeoutMs: 120_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
  DEV_ASSIST: {
    task: "DEV_ASSIST",
    primaryRole: REASONER,
    fallbackRoles: [MAIN],
    stream: false,
    maxTokens: 2048,
    temperature: 0.2,
    timeoutMs: 60_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
  MEMORY_COMPRESSION: {
    task: "MEMORY_COMPRESSION",
    primaryRole: MAIN,
    fallbackRoles: [REASONER, CONTROL],
    stream: false,
    maxTokens: 1792,
    timeoutMs: 30_000,
    budgetLevel: "medium",
    responseFormatJsonObject: true,
  },
};

/** Roles that must never run under a given task (enforced before network). */
export const TASK_ROLE_FORBIDDEN: Readonly<Record<TaskType, ReadonlySet<AiLogicalRole>>> = {
  PLAYER_CHAT: new Set([REASONER, ENHANCE]),
  PLAYER_CONTROL_PREFLIGHT: new Set([REASONER, ENHANCE]),
  INTENT_PARSE: new Set([REASONER, ENHANCE]),
  SAFETY_PREFILTER: new Set([REASONER, ENHANCE]),
  RULE_RESOLUTION: new Set([REASONER, ENHANCE]),
  COMBAT_NARRATION: new Set([REASONER, ENHANCE]),
  SCENE_ENHANCEMENT: new Set([REASONER]),
  NPC_EMOTION_POLISH: new Set([REASONER]),
  WORLDBUILD_OFFLINE: new Set([ENHANCE]),
  STORYLINE_SIMULATION: new Set([ENHANCE]),
  DEV_ASSIST: new Set([ENHANCE]),
  MEMORY_COMPRESSION: new Set([ENHANCE]),
};

/** @deprecated Use TASK_ROLE_FORBIDDEN */
export const TASK_MODEL_FORBIDDEN = TASK_ROLE_FORBIDDEN;

export function getTaskBinding(task: TaskType): TaskBinding {
  const base = TASK_POLICY[task];
  const env = resolveAiEnv();
  if (env.offlineBudgetProfile !== "peak") return base;
  if (task === "WORLDBUILD_OFFLINE") {
    return {
      ...base,
      maxTokens: Math.min(base.maxTokens, 1536),
      timeoutMs: Math.min(base.timeoutMs, 45_000),
    };
  }
  if (task === "DEV_ASSIST") {
    return {
      ...base,
      maxTokens: Math.min(base.maxTokens, 1536),
      timeoutMs: Math.min(base.timeoutMs, 35_000),
    };
  }
  if (task === "STORYLINE_SIMULATION") {
    return {
      ...base,
      maxTokens: Math.min(base.maxTokens, 4096),
      timeoutMs: Math.min(base.timeoutMs, 75_000),
    };
  }
  return base;
}

export function isRoleForbiddenForTask(task: TaskType, role: AiLogicalRole): boolean {
  return TASK_ROLE_FORBIDDEN[task].has(role);
}

/** @deprecated Use isRoleForbiddenForTask */
export function isModelForbiddenForTask(task: TaskType, role: AiLogicalRole): boolean {
  return isRoleForbiddenForTask(task, role);
}

function uniqueRoles(ids: readonly AiLogicalRole[]): AiLogicalRole[] {
  const out: AiLogicalRole[] = [];
  const seen = new Set<AiLogicalRole>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function filterRolesWithConfiguredModel(chain: AiLogicalRole[], env: ResolvedAiEnv): AiLogicalRole[] {
  return chain.filter((r) => (env.modelsByRole[r] ?? "").trim().length > 0);
}

function applyForbidden(task: TaskType, chain: AiLogicalRole[]): AiLogicalRole[] {
  return chain.filter((r) => !isRoleForbiddenForTask(task, r));
}

/**
 * Ordered candidate logical roles for the task (before resolving to gateway model strings).
 */
export function resolveOrderedRoleChain(
  task: TaskType,
  env: ResolvedAiEnv = resolveAiEnv(),
  mode: OperationMode = resolveOperationMode()
): AiLogicalRole[] {
  const b = getTaskBinding(task);
  let base: AiLogicalRole[] = [b.primaryRole, ...b.fallbackRoles];

  if (task === "PLAYER_CHAT") {
    if (mode === "emergency") {
      base = [MAIN];
    } else if (mode === "safe") {
      base = uniqueRoles([b.primaryRole, ...b.fallbackRoles]);
    } else {
      base = uniqueRoles([b.primaryRole, ...b.fallbackRoles, ...env.playerRoleFallbackChain]);
    }
  } else if (task === "MEMORY_COMPRESSION") {
    const p = env.memoryPrimaryRole;
    base = uniqueRoles([p, b.primaryRole, ...b.fallbackRoles.filter((x) => x !== p)]);
  } else if (task === "DEV_ASSIST") {
    const p = env.devAssistPrimaryRole;
    base = uniqueRoles([p, b.primaryRole, ...b.fallbackRoles.filter((x) => x !== p)]);
  }

  if (env.offlineFailFast && (task === "WORLDBUILD_OFFLINE" || task === "DEV_ASSIST")) {
    base = [REASONER, ...(env.offlineAllowMainFallback ? [MAIN] : [])];
  }

  const allowed = applyForbidden(task, base);
  if (allowed.length < base.length) {
    const dropped = base.filter((id) => !allowed.includes(id));
    console.warn(
      `[ai/taskPolicy] Dropped roles for task=${task} (forbidden or duplicate): ${dropped.join(", ") || "(none)"}`
    );
  }
  return filterRolesWithConfiguredModel(allowed, env);
}

/** @deprecated Use resolveOrderedRoleChain */
export const resolveOrderedModelChain = resolveOrderedRoleChain;

export function resolveFallbackPolicy(
  task: TaskType,
  env: ResolvedAiEnv = resolveAiEnv(),
  mode: OperationMode = resolveOperationMode()
): FallbackPolicy {
  const chain = resolveOrderedRoleChain(task, env, mode);
  return {
    chain,
    stopOnFirstSuccess: true,
    tripCircuitOnFailure: true,
  };
}

export interface RoutingTraceLine {
  role: AiLogicalRole;
  excluded: boolean;
  reason?: "forbidden" | "no_model_config" | "duplicate";
}

/** For logs / admin debug: why each role was kept or skipped (pre-model filter). */
export function explainTaskRouting(
  task: TaskType,
  env: ResolvedAiEnv = resolveAiEnv(),
  mode: OperationMode = resolveOperationMode()
): RoutingTraceLine[] {
  const b = getTaskBinding(task);
  let base: AiLogicalRole[] = [b.primaryRole, ...b.fallbackRoles];
  if (task === "PLAYER_CHAT") {
    if (mode === "emergency") {
      base = [MAIN];
    } else if (mode === "safe") {
      base = uniqueRoles([b.primaryRole, ...b.fallbackRoles]);
    } else {
      base = uniqueRoles([b.primaryRole, ...b.fallbackRoles, ...env.playerRoleFallbackChain]);
    }
  } else if (task === "MEMORY_COMPRESSION") {
    const p = env.memoryPrimaryRole;
    base = uniqueRoles([p, b.primaryRole, ...b.fallbackRoles.filter((x) => x !== p)]);
  } else if (task === "DEV_ASSIST") {
    const p = env.devAssistPrimaryRole;
    base = uniqueRoles([p, b.primaryRole, ...b.fallbackRoles.filter((x) => x !== p)]);
  }

  const seen = new Set<AiLogicalRole>();
  const lines: RoutingTraceLine[] = [];
  for (const role of base) {
    if (seen.has(role)) {
      lines.push({ role, excluded: true, reason: "duplicate" });
      continue;
    }
    seen.add(role);
    if (isRoleForbiddenForTask(task, role)) {
      lines.push({ role, excluded: true, reason: "forbidden" });
      continue;
    }
    const after = filterRolesWithConfiguredModel([role], env);
    if (after.length === 0) {
      lines.push({ role, excluded: true, reason: "no_model_config" });
      continue;
    }
    lines.push({ role, excluded: false });
  }
  return lines;
}

/** Markdown table for docs / copy-paste into runbooks. */
export function exportTaskModelMatrixMarkdown(): string {
  const rows: string[] = [
    "| Task | PrimaryRole | FallbackRoles | Stream | max_tokens | timeout_ms | budget | json_mode |",
    "|------|-------------|---------------|--------|------------|------------|--------|-----------|",
  ];
  for (const t of Object.keys(TASK_POLICY) as TaskType[]) {
    const b = TASK_POLICY[t];
    rows.push(
      `| ${b.task} | ${b.primaryRole} | ${b.fallbackRoles.join(", ")} | ${b.stream} | ${b.maxTokens} | ${b.timeoutMs} | ${b.budgetLevel} | ${b.responseFormatJsonObject} |`
    );
  }
  rows.push("", "## Forbidden role × task", "", "| Task | Forbidden roles |", "|------|-----------------|");
  for (const t of Object.keys(TASK_ROLE_FORBIDDEN) as TaskType[]) {
    const s = [...TASK_ROLE_FORBIDDEN[t]].join(", ");
    rows.push(`| ${t} | ${s} |`);
  }
  return rows.join("\n");
}

export function assertRoleAllowedForTask(task: TaskType, role: AiLogicalRole): void {
  if (isRoleForbiddenForTask(task, role)) {
    throw new Error(`[ai] Logical role ${role} is forbidden for task ${task}`);
  }
}

/** @deprecated Use assertRoleAllowedForTask */
export function assertModelAllowedForTask(task: TaskType, role: AiLogicalRole): void {
  assertRoleAllowedForTask(task, role);
}

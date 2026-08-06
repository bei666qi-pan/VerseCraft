// src/lib/worldEngine/actorSimulation/config.ts
/**
 * Phase 3: Actor Simulation Feature Flags
 *
 * 所有新能力均通过独立灰度开关控制，关闭后旧 world director 路径不受影响。
 */

import { envBoolean, envNumber } from "@/lib/config/envRaw";
import type { ActorSimulationFlags } from "./types";

// ============================================================
// Default Configuration
// ============================================================

const DEFAULTS: ActorSimulationFlags = {
  enabled: false,
  mode: "batch_shadow",
  maxActors: 3,
  horizonTurns: 2,
  totalTickBudgetMs: 30_000,
  perActorTimeoutMs: 10_000,
  maxActionsPerActor: 3,
};

// ============================================================
// Resolver
// ============================================================

/**
 * 解析 Actor Simulation 灰度配置。
 *
 * 环境变量：
 * - `VERSECRAFT_ENABLE_ACTOR_SIMULATION`: 主开关（true/false）
 * - `VERSECRAFT_ACTOR_SIMULATION_MODE`: 模式（off/batch_shadow/batch_soft）
 * - `VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS`: 最大推演 NPC 数
 * - `VERSECRAFT_ACTOR_SIMULATION_HORIZON_TURNS`: 推演视界
 * - `VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS`: 总 tick 预算
 * - `VERSECRAFT_ACTOR_SIMULATION_PER_ACTOR_TIMEOUT_MS`: 每 actor 超时
 */
export function resolveActorSimulationFlags(): ActorSimulationFlags {
  const enabled = envBoolean("VERSECRAFT_ENABLE_ACTOR_SIMULATION", DEFAULTS.enabled);

  const rawMode = (process.env.VERSECRAFT_ACTOR_SIMULATION_MODE ?? "").trim().toLowerCase();
  const mode = (["off", "batch_shadow", "batch_soft"] as const).find((m) => m === rawMode) ?? DEFAULTS.mode;

  const maxActors = envNumber("VERSECRAFT_ACTOR_SIMULATION_MAX_ACTORS", DEFAULTS.maxActors);
  const horizonTurns = envNumber("VERSECRAFT_ACTOR_SIMULATION_HORIZON_TURNS", DEFAULTS.horizonTurns);
  const totalTickBudgetMs = envNumber("VERSECRAFT_ACTOR_SIMULATION_TICK_BUDGET_MS", DEFAULTS.totalTickBudgetMs);
  const perActorTimeoutMs = envNumber("VERSECRAFT_ACTOR_SIMULATION_PER_ACTOR_TIMEOUT_MS", DEFAULTS.perActorTimeoutMs);
  const maxActionsPerActor = envNumber("VERSECRAFT_ACTOR_SIMULATION_MAX_ACTIONS_PER_ACTOR", DEFAULTS.maxActionsPerActor);

  return {
    enabled,
    mode,
    maxActors: Math.max(0, Math.min(5, maxActors)),
    horizonTurns: Math.max(1, Math.min(3, horizonTurns)),
    totalTickBudgetMs: Math.max(5_000, Math.min(60_000, totalTickBudgetMs)),
    perActorTimeoutMs: Math.max(2_000, Math.min(20_000, perActorTimeoutMs)),
    maxActionsPerActor: Math.max(1, Math.min(5, maxActionsPerActor)),
  };
}

/**
 * Actor Simulation 是否应该运行（非 off 模式且已启用）。
 */
export function shouldRunActorSimulation(flags: ActorSimulationFlags): boolean {
  return flags.enabled && flags.mode !== "off";
}

/**
 * Actor Simulation 是否处于 shadow 模式（只记录不提交）。
 */
export function isActorSimulationShadow(flags: ActorSimulationFlags): boolean {
  return flags.mode === "batch_shadow";
}

// src/lib/ai/tools/worldScopeGuard.ts
/**
 * Symbolic World Model v2 — Phase 5A worldId / mapId 隔离守卫
 *
 * 背景：
 * - 每个 write tool handler 必须校验入参 `worldId === ctx.worldId` / `mapId === ctx.mapId`，
 *   否则以 `code: "world_mismatch"` 拒绝并直接 fail-fast。
 * - 隔离通过 worldId + registry + packet 实现（与 `AGENTS.md §2.4` 一致）。
 * - 守卫是纯函数，**不**做 IO，方便在 handler 入口与 unit test 中复用。
 *
 * 实现要点：
 * - `enforceWorldScope(args, ctx, opts)` 入参 = tool args + ctx + 守卫选项。
 * - read tool 仍走守卫（即使只读也必须世界作用域正确，否则可能读到错误世界的快照）。
 * - 守卫失败时返回 `DmToolResult` 失败形态（`ok: false, code: "world_mismatch"`），
 *   handler 直接 return，不再继续业务逻辑。
 *
 * 参考：
 * - AGENTS.md §2.5.3
 * - openspec/changes/integrate-bounded-dm-agent-tools/specs/symbolic-world-model-player-chat/spec.md
 */
import type { DmAgentContext, DmToolResult } from "./dmAgentTypes";

export type WorldScopeGuardOptions = {
  /**
   * 工具名（用于 narrativeContext / telemetry）。
   */
  toolName: string;
  /**
   * args 中 worldId 字段名（默认 "worldId"）。
   */
  worldIdKey?: string;
  /**
   * args 中 mapId 字段名（默认 "mapId"）。
   */
  mapIdKey?: string;
  /**
   * 是否要求 args 必填 worldId。默认 true（与 §2.5.3 一致）。
   * 设为 false 时允许 args 缺 worldId（仅以 ctx.worldId 校验）。
   */
  requireWorldIdInArgs?: boolean;
  /**
   * 是否要求 args 必填 mapId。默认 true。
   */
  requireMapIdInArgs?: boolean;
};

/**
 * 从 args 读取字符串字段（trim + 类型校验）。
 * 缺失或非 string 返回 null。
 */
function readStringField(args: Record<string, unknown>, key: string): string | null {
  const raw = args[key];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 在 handler 入口校验 worldId / mapId 隔离。
 * 失败时返回 DmToolResult 失败形态，handler 应直接 return。
 * 成功时返回 null，handler 继续业务逻辑。
 *
 * 校验规则：
 * 1. 若 requireWorldIdInArgs=true（默认）：args.worldId 必填；缺失 → 拒绝。
 * 2. args.worldId 必填时与 ctx.worldId 严格相等；不一致 → 拒绝。
 * 3. ctx.worldId 必填（守卫自己强校验）。
 * 4. 若 requireMapIdInArgs=true：args.mapId 必填；缺失 → 拒绝。
 * 5. args.mapId 与 ctx.mapId 严格相等；ctx.mapId 缺失时放行（兼容老 ctx）。
 */
export function enforceWorldScope(
  args: Record<string, unknown>,
  ctx: { worldId: string; mapId?: string },
  opts: WorldScopeGuardOptions
): DmToolResult | null {
  const worldIdKey = opts.worldIdKey ?? "worldId";
  const mapIdKey = opts.mapIdKey ?? "mapId";
  const requireWorldIdInArgs = opts.requireWorldIdInArgs ?? true;
  const requireMapIdInArgs = opts.requireMapIdInArgs ?? true;

  // ctx.worldId 必须存在（system invariant）。
  if (!ctx.worldId || typeof ctx.worldId !== "string") {
    return {
      ok: false,
      error: `${opts.toolName} handler invoked without ctx.worldId`,
      code: "internal_error",
      narrativeContext: "系统上下文缺失 worldId",
    };
  }

  // args.worldId 校验。
  const argWorldId = readStringField(args, worldIdKey);
  if (requireWorldIdInArgs && !argWorldId) {
    return {
      ok: false,
      error: `${opts.toolName}: ${worldIdKey} is required`,
      code: "validation_error",
      narrativeContext: "系统要求每个工具调用都明确所在 worldId",
      recoveryHint: "重新调用并填入 worldId（应与当前世界一致）",
    };
  }
  if (argWorldId && argWorldId !== ctx.worldId) {
    return {
      ok: false,
      error: `${opts.toolName} worldId "${argWorldId}" mismatches session worldId "${ctx.worldId}"`,
      code: "world_mismatch",
      narrativeContext: "工具调用跨世界，服务器拒绝执行",
      recoveryHint: `只对当前世界 (${ctx.worldId}) 的工具调用会被接受`,
    };
  }

  // args.mapId 校验（若 ctx.mapId 存在）。
  if (ctx.mapId) {
    const argMapId = readStringField(args, mapIdKey);
    if (requireMapIdInArgs && !argMapId) {
      return {
        ok: false,
        error: `${opts.toolName}: ${mapIdKey} is required`,
        code: "validation_error",
        narrativeContext: "系统要求每个工具调用都明确所在 mapId",
        recoveryHint: "重新调用并填入 mapId（应与当前地图一致）",
      };
    }
    if (argMapId && argMapId !== ctx.mapId) {
      return {
        ok: false,
        error: `${opts.toolName} mapId "${argMapId}" mismatches session mapId "${ctx.mapId}"`,
        code: "world_mismatch",
        narrativeContext: "工具调用跨地图，服务器拒绝执行",
        recoveryHint: `只对当前地图 (${ctx.mapId}) 的工具调用会被接受`,
      };
    }
  }

  return null;
}

/**
 * 仅做布尔判定（不返回 DmToolResult）。用于 read tool 的早返回路径
 * 或 telemetry 旁路统计。失败原因通过 errorOut 参数返回。
 */
export function checkWorldScope(
  args: Record<string, unknown>,
  ctx: { worldId: string; mapId?: string },
  opts: WorldScopeGuardOptions
): { ok: true } | { ok: false; reason: string; code: "world_mismatch" | "validation_error" } {
  const result = enforceWorldScope(args, ctx, opts);
  if (result === null) return { ok: true };
  // Narrow: enforceWorldScope only returns failure shapes.
  const failure = result as { ok: false; error: string; code: "world_mismatch" | "validation_error" };
  return { ok: false, reason: failure.error, code: failure.code };
}

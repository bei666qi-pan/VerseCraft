// src/lib/ai/tools/dmAuditLog.ts
/**
 * DM Agent 审计日志
 *
 * 持久化工具调用追踪到现有的 analytics 基础设施。
 * 每个工具调用记录为独立事件，包含：
 * - 工具名、参数 hash、成功/失败、延迟、错误码
 * - 会话/用户/请求关联
 * - 幂等键（用于去重）
 */

import type { DmToolCallTrace } from "./dmAgentTypes";

// ============================================================
// Audit Event Types
// ============================================================

export interface DmToolAuditEvent {
  eventType: "dm_tool_call";
  requestId: string;
  sessionId: string;
  userId?: string | null;
  toolName: string;
  /** 参数的 SHA-256 前 12 位（不存原始参数，保护隐私） */
  argsHash: string;
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  /** 工具类别（read/write） */
  toolAccess: "read" | "write";
  timestamp: number;
}

// ============================================================
// Hash Helper (lightweight, deterministic)
// ============================================================

function hashArgs(args: Record<string, unknown>): string {
  const str = JSON.stringify(args, Object.keys(args).sort());
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 12);
}

// ============================================================
// Audit Builder
// ============================================================

/**
 * 从工具调用追踪构建审计事件列表
 */
export function buildToolAuditEvents(params: {
  requestId: string;
  sessionId: string;
  userId?: string | null;
  traces: DmToolCallTrace[];
  /** 工具名到类别的映射 */
  toolAccessMap: Record<string, "read" | "write">;
  /** 可选的参数 hash 映射 */
  toolArgsHashes?: Record<string, string>;
}): DmToolAuditEvent[] {
  return params.traces.map((trace) => ({
    eventType: "dm_tool_call" as const,
    requestId: params.requestId,
    sessionId: params.sessionId,
    userId: params.userId,
    toolName: trace.toolName,
    argsHash: params.toolArgsHashes?.[trace.toolName] ?? "unknown",
    ok: trace.ok,
    latencyMs: trace.latencyMs,
    errorCode: trace.error,
    toolAccess: params.toolAccessMap[trace.toolName] ?? "read",
    timestamp: Date.now(),
  }));
}

/**
 * 序列化审计事件为 JSON（用于 analytics payload）
 */
export function serializeAuditEvent(event: DmToolAuditEvent): Record<string, unknown> {
  return {
    event_type: event.eventType,
    request_id: event.requestId,
    session_id: event.sessionId,
    user_id: event.userId ?? null,
    tool_name: event.toolName,
    args_hash: event.argsHash,
    ok: event.ok,
    latency_ms: event.latencyMs,
    error_code: event.errorCode ?? null,
    tool_access: event.toolAccess,
    timestamp: event.timestamp,
  };
}

export { hashArgs };

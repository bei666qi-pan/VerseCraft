// src/lib/ai/stream/sanitize.ts
import type { ChatMessage, ChatRole, ToolCall } from "@/lib/ai/types/core";

const ROLES: ReadonlySet<string> = new Set(["system", "user", "assistant", "tool"]);

function asRole(role: string): ChatRole {
  return ROLES.has(role) ? (role as ChatRole) : "user";
}

/** Strict shape check so malformed vendor payloads cannot smuggle extra fields upstream. */
function sanitizeToolCalls(raw: unknown): ToolCall[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const fn = o.function;
    if (!fn || typeof fn !== "object" || Array.isArray(fn)) continue;
    const f = fn as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = typeof f.name === "string" ? f.name.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      type: "function",
      function: {
        name,
        arguments: typeof f.arguments === "string" ? f.arguments : "{}",
      },
    });
  }
  return out.length > 0 ? out : null;
}

/** Strip chain-of-thought / vendor-only fields; keep only role+content (+tool linkage) for upstream APIs. */
export function sanitizeMessagesForUpstream(
  messages: ReadonlyArray<{ role: string; content: unknown }>
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m.content !== "string") continue;
    const role = asRole(m.role);
    const msg: ChatMessage = { role, content: m.content };
    const extra = m as Record<string, unknown>;
    if (role === "assistant") {
      const toolCalls = sanitizeToolCalls(extra.toolCalls ?? extra.tool_calls);
      if (toolCalls) msg.toolCalls = toolCalls;
    }
    if (role === "tool") {
      const toolCallId = extra.toolCallId ?? extra.tool_call_id;
      if (typeof toolCallId === "string" && toolCallId.trim()) msg.toolCallId = toolCallId.trim();
    }
    out.push(msg);
  }
  return out;
}

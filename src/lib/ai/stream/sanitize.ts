// src/lib/ai/stream/sanitize.ts
import type { ChatMessage, ChatRole } from "@/lib/ai/types/core";

const ROLES: ReadonlySet<string> = new Set(["system", "user", "assistant", "tool"]);

function asRole(role: string): ChatRole {
  return ROLES.has(role) ? (role as ChatRole) : "user";
}

/** Strip chain-of-thought / vendor-only fields; keep only role+content for upstream APIs. */
export function sanitizeMessagesForUpstream(
  messages: ReadonlyArray<{ role: string; content: unknown }>
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m.content !== "string") continue;
    out.push({ role: asRole(m.role), content: m.content });
  }
  return out;
}

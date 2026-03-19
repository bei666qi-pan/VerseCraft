import { sanitizeInputText } from "@/lib/security/helpers";

export type IncomingMessage = {
  role: "system" | "user" | "assistant" | string;
  content: string;
  reasoning_content?: unknown;
};

export type ChatValidationResult =
  | { ok: true; messages: IncomingMessage[]; playerContext: string; latestUserInput: string; sessionId: string | null }
  | { ok: false; status: number; error: string };

const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 4000;
const MAX_PLAYER_CONTEXT_CHARS = 6000;

export function validateChatRequest(body: unknown): ChatValidationResult {
  const rawMessages = (body as any)?.messages;
  const rawPlayerContext = (body as any)?.playerContext;
  const rawSessionId = (body as any)?.sessionId;

  if (!Array.isArray(rawMessages)) {
    return { ok: false, status: 400, error: "messages must be an array" };
  }
  if (rawMessages.length === 0 || rawMessages.length > MAX_MESSAGES) {
    return { ok: false, status: 400, error: "messages size is invalid" };
  }

  const sanitizedMessages: IncomingMessage[] = [];
  for (const item of rawMessages) {
    const role = String(item?.role ?? "").trim();
    const content = sanitizeInputText(String(item?.content ?? ""), MAX_MESSAGE_CHARS);
    if (!role || !content) {
      return { ok: false, status: 400, error: "invalid message item" };
    }
    if (!["system", "user", "assistant"].includes(role)) {
      return { ok: false, status: 400, error: "invalid message role" };
    }
    sanitizedMessages.push({ role, content });
  }

  const playerContext = sanitizeInputText(String(rawPlayerContext ?? ""), MAX_PLAYER_CONTEXT_CHARS);
  const latestUserInput =
    sanitizedMessages
      .slice()
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";

  const sessionIdCandidate = sanitizeInputText(String(rawSessionId ?? ""), 120);
  const sessionId = sessionIdCandidate || null;

  return {
    ok: true,
    messages: sanitizedMessages,
    playerContext,
    latestUserInput,
    sessionId,
  };
}

import { normalizePlayerDmJson } from "@/lib/playRealtime/normalizePlayerDmJson";
import { isActionlessPlayerInput } from "@/lib/security/chatValidation";
import { VERSECRAFT_FINAL_PREFIX, sseText } from "@/lib/turnEngine/sse";

type ValidationFailure = { ok: false; status: number; error: string };

export function isEmptyChatInput(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return false;
  const latestUser = [...messages].reverse().find((message) => {
    return message && typeof message === "object" && !Array.isArray(message)
      && String((message as { role?: unknown }).role ?? "") === "user";
  }) as { content?: unknown } | undefined;
  return latestUser !== undefined && isActionlessPlayerInput(latestUser.content);
}

export function buildChatValidationFailureResponse(args: {
  validation: ValidationFailure;
  requestId: string;
  isEmptyInput: boolean;
}): Response {
  if (!args.isEmptyInput) {
    return Response.json({ error: args.validation.error }, { status: args.validation.status });
  }

  const dm = normalizePlayerDmJson({
    is_action_legal: false,
    sanity_damage: 0,
    narrative: "玩家输入不能为空。请输入一个明确的行动。",
    is_death: false,
    consumes_time: false,
    options: [],
    internal_meta: {
      action: "input_rejected",
      request_id: args.requestId,
      reason: "empty_player_input",
    },
  });

  return new Response(sseText(`${VERSECRAFT_FINAL_PREFIX}${JSON.stringify(dm)}`), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-VerseCraft-Request-Id": args.requestId,
    },
  });
}

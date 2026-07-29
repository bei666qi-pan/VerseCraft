import {
  isPlayerTurnTerminalToolName,
  resolvePlayerChatFunctionCallingMode,
} from "@/lib/ai/tools/playerTurnTerminalTool";

 type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function parseRequestPayload(init: RequestInit): JsonRecord | null {
  if (typeof init.body !== "string") return null;
  try {
    return asRecord(JSON.parse(init.body));
  } catch {
    return null;
  }
}

function readNamedToolChoice(payload: JsonRecord | null): string | null {
  const toolChoice = asRecord(payload?.tool_choice);
  const fn = asRecord(toolChoice?.function);
  const name = typeof fn?.name === "string" ? fn.name.trim() : "";
  return name || null;
}

export function isPlayerTurnTerminalToolRequest(init: RequestInit): boolean {
  return isPlayerTurnTerminalToolName(readNamedToolChoice(parseRequestPayload(init)));
}

/** Remove the terminal tool envelope and restore the legacy JSON mode request. */
export function buildPlayerTurnJsonFallbackInit(init: RequestInit): RequestInit {
  const payload = parseRequestPayload(init);
  if (!payload || !isPlayerTurnTerminalToolName(readNamedToolChoice(payload))) return init;
  const next = { ...payload };
  delete next.tools;
  delete next.tool_choice;
  delete next.parallel_tool_calls;
  next.response_format = { type: "json_object" };
  return { ...init, body: JSON.stringify(next) };
}

const TOOL_COMPATIBILITY_STATUSES = new Set([400, 404, 422, 501]);
const TOOL_COMPATIBILITY_RE =
  /tool_choice|tool calls?|function calls?|function_call|unknown (?:field|parameter)|unsupported|not support|does not support/i;

/** Whether prefer-mode should retry the same request once without Function Calling. */
export async function shouldFallbackPlayerTurnTerminalTool(
  response: Response,
  init: RequestInit
): Promise<boolean> {
  if (resolvePlayerChatFunctionCallingMode() !== "prefer") return false;
  if (!isPlayerTurnTerminalToolRequest(init)) return false;
  if (!TOOL_COMPATIBILITY_STATUSES.has(response.status)) return false;
  try {
    const text = await response.clone().text();
    return TOOL_COMPATIBILITY_RE.test(text.slice(0, 8_000));
  } catch {
    return false;
  }
}

type ToolStreamState = {
  expectedToolName: string;
  nameByIndex: Map<number, string>;
};

function readCallIndex(call: JsonRecord): number {
  const index = Number(call.index ?? 0);
  return Number.isInteger(index) && index >= 0 ? index : 0;
}

function extractToolArgumentFragment(holder: JsonRecord, state: ToolStreamState): string {
  const rawCalls = holder.tool_calls ?? holder.toolCalls;
  if (Array.isArray(rawCalls)) {
    for (const rawCall of rawCalls) {
      const call = asRecord(rawCall);
      const fn = asRecord(call?.function);
      if (!call || !fn) continue;
      const index = readCallIndex(call);
      // The player-turn contract permits exactly one terminal call.
      if (index !== 0) continue;
      const declaredName = typeof fn.name === "string" ? fn.name.trim() : "";
      if (declaredName) state.nameByIndex.set(index, declaredName);
      const effectiveName = declaredName || state.nameByIndex.get(index) || state.expectedToolName;
      if (effectiveName !== state.expectedToolName) continue;
      return typeof fn.arguments === "string" ? fn.arguments : "";
    }
  }

  // Compatibility with older OpenAI-style `function_call` deltas.
  const legacy = asRecord(holder.function_call ?? holder.functionCall);
  if (legacy) {
    const declaredName = typeof legacy.name === "string" ? legacy.name.trim() : "";
    if (declaredName) state.nameByIndex.set(0, declaredName);
    const effectiveName = declaredName || state.nameByIndex.get(0) || state.expectedToolName;
    if (effectiveName === state.expectedToolName) {
      return typeof legacy.arguments === "string" ? legacy.arguments : "";
    }
  }
  return "";
}

function stripToolFields(holder: JsonRecord): void {
  delete holder.tool_calls;
  delete holder.toolCalls;
  delete holder.function_call;
  delete holder.functionCall;
}

function rewriteChoice(choice: JsonRecord, state: ToolStreamState): void {
  for (const key of ["delta", "message"] as const) {
    const holder = asRecord(choice[key]);
    if (!holder) continue;
    const fragment = extractToolArgumentFragment(holder, state);
    const existing = typeof holder.content === "string" ? holder.content : "";
    if (fragment) holder.content = `${existing}${fragment}`;
    stripToolFields(holder);
  }
  if (choice.finish_reason === "tool_calls" || choice.finish_reason === "function_call") {
    choice.finish_reason = "stop";
  }
  if (choice.finishReason === "tool_calls" || choice.finishReason === "function_call") {
    choice.finishReason = "stop";
  }
}

function rewriteCompletionObject(value: unknown, state: ToolStreamState): unknown {
  const root = asRecord(value);
  if (!root) return value;
  const choices = root.choices;
  if (!Array.isArray(choices)) return root;
  for (const rawChoice of choices) {
    const choice = asRecord(rawChoice);
    if (choice) rewriteChoice(choice, state);
  }
  return root;
}

function rewriteSseLine(line: string, state: ToolStreamState): string {
  const match = line.match(/^(\s*data:\s*)(.*)$/);
  if (!match) return line;
  const data = match[2].trim();
  if (!data || data === "[DONE]") return line;
  try {
    const parsed: unknown = JSON.parse(data);
    return `${match[1]}${JSON.stringify(rewriteCompletionObject(parsed, state))}`;
  } catch {
    return line;
  }
}

function rewriteSseBody(body: ReadableStream<Uint8Array>, expectedToolName: string): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state: ToolStreamState = { expectedToolName, nameByIndex: new Map() };
  let buffer = "";

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
          controller.enqueue(encoder.encode(`${rewriteSseLine(line, state)}\n`));
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) controller.enqueue(encoder.encode(rewriteSseLine(buffer, state)));
      },
    })
  );
}

function cloneResponse(response: Response, body: BodyInit | null): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

/**
 * Project terminal tool argument chunks back onto `content`. The rest of the app
 * therefore receives exactly the same DM JSON transport it handled before this upgrade.
 */
export async function normalizePlayerTurnTerminalToolResponse(
  response: Response,
  init: RequestInit
): Promise<Response> {
  if (!response.ok || !isPlayerTurnTerminalToolRequest(init)) return response;
  const payload = parseRequestPayload(init);
  const expectedToolName = readNamedToolChoice(payload);
  if (!expectedToolName) return response;

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const streamRequested = payload?.stream === true;
  if ((streamRequested || contentType.includes("text/event-stream")) && response.body) {
    return cloneResponse(response, rewriteSseBody(response.body, expectedToolName));
  }

  try {
    const parsed: unknown = await response.clone().json();
    const state: ToolStreamState = { expectedToolName, nameByIndex: new Map() };
    return cloneResponse(response, JSON.stringify(rewriteCompletionObject(parsed, state)));
  } catch {
    return response;
  }
}

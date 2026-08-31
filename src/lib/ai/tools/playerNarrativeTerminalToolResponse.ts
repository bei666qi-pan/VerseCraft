// src/lib/ai/tools/playerNarrativeTerminalToolResponse.ts
/**
 * Phase 5.B submit_narrative terminal tool 的 response 投影：
 * 复用 playerTurnTerminalToolResponse.ts 的 rewriteChoice / rewriteSseBody 投影逻辑，
 * 把 submit_narrative.args 投影回 message.content，物理上让下游 normalize/validator
 * 看到的就是普通 JSON 模式响应，无需任何下游代码改动。
 *
 * Spec 要求（openspec/changes/integrate-bounded-dm-agent-tools/specs/symbolic-world-model-player-chat/spec.md
 *   Requirement: submit_narrative terminal tool）：
 *   "server 端把 args 投影回 message.content，再走 normalizePlayerDmJson →
 *    resolveDmTurn → commitTurn → __VERSECRAFT_FINAL__ 既有收口链"
 *
 * 兼容：当 stream body 不在期望工具集合时（provider 没用 submit_narrative，
 * 用了别的 tool_call），原样返回 response，不做投影。
 */
import {
  isPlayerNarrativeTerminalToolName,
  PLAYER_NARRATIVE_TERMINAL_TOOL_NAME,
} from "./playerNarrativeTerminalTool";
import {
  parseRequestPayload,
  isResponsesApiPayload,
  projectTerminalToolResponse,
} from "@/lib/ai/stream/playerTurnTerminalToolResponse";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function readNamedToolChoice(payload: JsonRecord | null): string | null {
  const toolChoice = asRecord(payload?.tool_choice);
  if (!toolChoice) return null;
  // Chat Completions wire shape: { type: "function", function: { name: "..." } }
  const fn = asRecord(toolChoice.function);
  const nestedName = typeof fn?.name === "string" ? fn.name.trim() : "";
  if (nestedName) return nestedName;
  // Responses API wire shape: { type: "function", name: "..." }
  const flatName = typeof toolChoice.name === "string" ? toolChoice.name.trim() : "";
  return flatName || null;
}

/**
 * 探测 init 是否使用了 submit_narrative 工具的 strict function call 模式。
 * 同时支持 Chat Completions（tool_choice.function.name）和 Responses API
 * （tool_choice.name 顶层）两种 wire shape。
 */
export function isPlayerNarrativeTerminalToolRequest(init: RequestInit): boolean {
  return isPlayerNarrativeTerminalToolName(
    readNamedToolChoice(parseRequestPayload(init))
  );
}

/**
 * 投影 submit_narrative args 到 message.content。返回新 Response，下游代码（normalize
 * / validator / commit）无需任何修改即可像处理普通 narrative 响应一样处理它。
 */
export async function normalizePlayerNarrativeTerminalToolResponse(
  response: Response,
  init: RequestInit
): Promise<Response> {
  if (!response.ok) return response;
  if (!isPlayerNarrativeTerminalToolRequest(init)) return response;
  return projectTerminalToolResponse(
    response,
    init,
    PLAYER_NARRATIVE_TERMINAL_TOOL_NAME
  );
}

// Re-export wire-shape helpers so test files can assert on them.
export { parseRequestPayload, isResponsesApiPayload };

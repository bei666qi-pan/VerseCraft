/**
 * Dynamic memory compression for AI-driven game sessions.
 * Routed via unified AI layer (task: MEMORY_COMPRESSION).
 */

import { compressSessionMemory } from "@/lib/ai/logicalTasks";
import { createRequestId } from "@/lib/security/helpers";

export interface CompressedMemory {
  plot_summary: string;
  player_status: Record<string, unknown>;
  npc_relationships: Record<string, unknown>;
}

export interface ChatMessage {
  role: string;
  content: string;
}

const COMPRESSION_PROMPT = `你是一个游戏剧情整理员。请根据提供的『旧的剧情摘要』和『最新的 5 轮对话』，生成一份最新的全局状态报告。
请严格以 JSON 格式输出，且只输出 JSON，不要包含任何 markdown 或解释。必须包含以下字段：
- plot_summary: 字符串，用大概 300 字总结目前为止的核心剧情发展。
- player_status: 对象，包含用户当前所在位置、拥有的关键道具、健康/心理状态（如理智值）。
- npc_relationships: 对象格式，记录这 5 轮对话中发生过互动的 NPC 对用户的态度变化或好感度，key 为 NPC 名称或 ID。`;

function formatChatsForCompression(chats: ChatMessage[]): string {
  return chats
    .map((m) => `${m.role === "user" ? "用户" : "DM"}：${m.content}`)
    .join("\n\n");
}

function parseCompressionResponse(content: string): CompressedMemory | null {
  const trimmed = content.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const plot_summary = typeof parsed.plot_summary === "string" ? parsed.plot_summary : "";
    const player_status =
      parsed.player_status && typeof parsed.player_status === "object"
        ? (parsed.player_status as Record<string, unknown>)
        : {};
    const npc_relationships =
      parsed.npc_relationships && typeof parsed.npc_relationships === "object"
        ? (parsed.npc_relationships as Record<string, unknown>)
        : {};
    return { plot_summary, player_status, npc_relationships };
  } catch {
    return null;
  }
}

export async function compressMemory(
  oldSummary: CompressedMemory | null,
  oldestChats: ChatMessage[],
  options?: { timeoutMs?: number }
): Promise<CompressedMemory | null> {
  const timeoutMs = options?.timeoutMs ?? 30000;

  const oldBlock = oldSummary
    ? `【旧剧情摘要】\n${oldSummary.plot_summary}\n\n【旧用户状态】\n${JSON.stringify(oldSummary.player_status)}\n\n【旧 NPC 关系】\n${JSON.stringify(oldSummary.npc_relationships)}`
    : "（无）";

  const chatsBlock = formatChatsForCompression(oldestChats);
  const userContent = `【旧的剧情摘要】\n${oldBlock}\n\n【最新的 5 轮对话】\n${chatsBlock}`;

  const requestId = createRequestId("mem_compress");
  const result = await compressSessionMemory({
    messages: [
      { role: "system", content: COMPRESSION_PROMPT },
      { role: "user", content: userContent },
    ],
    ctx: {
      requestId,
      path: "/lib/memoryCompress",
    },
    requestTimeoutMs: timeoutMs,
  });

  if (!result.ok) {
    console.error("[memoryCompress] AI layer failed", result.code, result.message);
    return oldSummary;
  }

  const parsed = parseCompressionResponse(result.content);
  if (parsed) return parsed;
  console.error("[memoryCompress] Invalid JSON from compression model");
  return oldSummary;
}

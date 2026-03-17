/**
 * Dynamic memory compression for AI-driven game sessions.
 * Uses DeepSeek-V3.2 to compress old dialogue into a compact summary.
 */

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
请务必以 JSON 格式输出，且只输出 JSON，不要包含任何 markdown 或解释。必须包含以下字段：
- plot_summary: 字符串，用大概 300 字总结目前为止的核心剧情发展。
- player_status: 对象，包含用户当前所在位置、拥有的关键道具、健康/心理状态（如理智值）。
- npc_relationships: 对象格式，记录这 5 轮对话中发生过互动的 NPC 对用户的态度变化或好感度，key 为 NPC 名称或 ID。`;

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function resolveCompressionConfig(): { apiUrl: string; apiKey: string; model: string } {
  const apiUrl =
    getEnv("VOLCENGINE_DEEPSEEK_API_URL") ??
    getEnv("ARK_API_URL") ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  const apiKey = getEnv("VOLCENGINE_API_KEY") ?? getEnv("ARK_API_KEY") ?? getEnv("DEEPSEEK_API_KEY") ?? "";
  const model =
    getEnv("VOLCENGINE_ENDPOINT_ID") ??
    getEnv("ARK_ENDPOINT_ID") ??
    getEnv("VOLCENGINE_DEEPSEEK_MODEL") ??
    getEnv("DEEPSEEK_MODEL") ??
    "deepseek-v3.2";
  return { apiUrl, apiKey, model };
}

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
  options?: { timeoutMs?: number; maxRetries?: number }
): Promise<CompressedMemory | null> {
  const { apiUrl, apiKey, model } = resolveCompressionConfig();
  if (!apiKey) {
    console.warn("[memoryCompress] No API key, skip compression");
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 30000;
  const maxRetries = options?.maxRetries ?? 2;

  const oldBlock = oldSummary
    ? `【旧剧情摘要】\n${oldSummary.plot_summary}\n\n【旧用户状态】\n${JSON.stringify(oldSummary.player_status)}\n\n【旧 NPC 关系】\n${JSON.stringify(oldSummary.npc_relationships)}`
    : "（无）";

  const chatsBlock = formatChatsForCompression(oldestChats);
  const userContent = `【旧的剧情摘要】\n${oldBlock}\n\n【最新的 5 轮对话】\n${chatsBlock}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: COMPRESSION_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
        signal: ac.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data?.choices?.[0]?.message?.content ?? "";
      const result = parseCompressionResponse(raw);
      if (result) return result;

      lastError = new Error("Invalid JSON from compression API");
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      console.error(`[memoryCompress] attempt ${attempt + 1} failed`, err);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  if (lastError) {
    console.error("[memoryCompress] All retries failed", lastError);
  }
  return oldSummary;
}

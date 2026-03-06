// src/app/api/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingMessage = {
  role: "system" | "user" | "assistant" | string;
  content: string;
  reasoning_content?: unknown;
};

function buildSystemPrompt(playerContext: string): string {
  return [
    "你是一个冷酷无情的规则怪谈地下城主。",
    `当前玩家状态：${playerContext}`,
    "",
    "玩家即将进行动作。你必须执行两阶段推演：",
    "阶段一（合法性与人设校验）：玩家是否在进行“神明级”动作、使用未拥有的物品、或者违背其设定的性格？如果是，判定 is_action_legal: false，拒绝该动作，并给予严厉的理智惩罚叙事。",
    "阶段二（世界观响应）：如果合法，根据玩家的属性（理智/敏捷/幸运等）进行暗骰判定。",
    "",
    "请严格以 JSON 格式输出，Schema 如下：",
    '{ "is_action_legal": boolean, "sanity_damage": number, "narrative": "以第一人称视角推进的恐怖悬疑剧情，不要有任何多余的废话", "is_death": boolean }',
  ].join("\n");
}

function sse(data: string): Uint8Array {
  return new TextEncoder().encode(`data: ${data}\n\n`);
}

function sseText(data: string): string {
  return `data: ${data}\n\n`;
}

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function resolveDeepSeekConfig(): { apiUrl: string; apiKey: string; model: string } {
  const apiUrl =
    getEnv("VOLCENGINE_DEEPSEEK_API_URL") ??
    getEnv("ARK_API_URL") ??
    "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

  const apiKey = getEnv("VOLCENGINE_API_KEY") ?? getEnv("ARK_API_KEY") ?? getEnv("DEEPSEEK_API_KEY") ?? "";

  const model =
    getEnv("VOLCENGINE_DEEPSEEK_MODEL") ??
    getEnv("ARK_MODEL") ??
    getEnv("DEEPSEEK_MODEL") ??
    "deepseek-v3.2";

  return { apiUrl, apiKey, model };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as any)?.messages as IncomingMessage[] | undefined;
  const playerContext = String((body as any)?.playerContext ?? "");

  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages must be an array" }, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt(playerContext);

  // 历史消息清洗（极其重要）：仅保留 role 与 content，显式移除 reasoning_content
  const safeMessages = messages
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  safeMessages.unshift({ role: "system", content: systemPrompt });

  const { apiUrl, apiKey, model } = resolveDeepSeekConfig();
  if (!apiKey) {
    return new Response(
      sseText(
        JSON.stringify({
          is_action_legal: false,
          sanity_damage: 0,
          narrative: "系统异常：未配置 Volcengine API Key，无法连接深渊 DM。",
          is_death: false,
        })
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: safeMessages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      sseText(
        JSON.stringify({
          is_action_legal: false,
          sanity_damage: 0,
          narrative: `深渊 DM 连接失败（${upstream.status}）。${text ? `响应：${text}` : ""}`,
          is_death: false,
        })
      ),
      {
        status: 502,
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }
    );
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let accumulated = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);

        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();

        if (!data) continue;
        if (data === "[DONE]") {
          controller.close();
          return;
        }

        // OpenAI/Ark 兼容 SSE：data: { ...json... }
        let json: any = null;
        try {
          json = JSON.parse(data);
        } catch {
          // 若上游直接吐纯文本（极少见），仍按 chunk 转发
          accumulated += data;
          controller.enqueue(sse(data));
          continue;
        }

        const deltaContent =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.message?.content ??
          "";

        if (typeof deltaContent === "string" && deltaContent.length > 0) {
          accumulated += deltaContent;
          controller.enqueue(sse(deltaContent));
        }
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}


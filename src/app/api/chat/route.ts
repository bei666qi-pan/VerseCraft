// src/app/api/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingMessage = {
  role: "system" | "user" | "assistant" | string;
  content: string;
  reasoning_content?: unknown;
};

function buildSystemPrompt(playerContext: string, isFirstAction: boolean): string {
  const base = [
    "你是一个冷酷无情的规则怪谈地下城主。",
    `当前玩家状态：${playerContext}`,
    "",
    "玩家即将进行动作。你必须执行两阶段推演：",
    "阶段一（合法性与人设校验）：玩家是否在进行“神明级”动作、使用未拥有的物品、或者违背其设定的性格？如果是，判定 is_action_legal: false，拒绝该动作，并给予严厉的理智惩罚叙事。",
    "阶段二（世界观响应）：如果合法，根据玩家的属性（理智/敏捷/幸运等）进行暗骰判定。",
    "",
    "## 绝对世界法则与通关判定",
    "",
    "【地图与楼层】玩家初始在 B1 层苏醒。向上是 1-7 层（每层固定 1 个诡异），向下是 B2 层。",
    "",
    "【战斗法则】玩家绝对无法徒手对诡异或 NPC 造成伤害。任何尝试徒手攻击的指令，必须判定 is_action_legal: false，扣除理智值并给予残酷的惩罚叙事。玩家只能通过特定道具影响或杀死诡异/NPC。",
    "",
    "【NPC 交互】NPC 分布在随机楼层，性格各异（暴躁、温和、贪婪等）。玩家可通过对话/交易提升好感度获取道具，或使用致命道具击杀他们夺取。脾气差的 NPC 极易因玩家不当言辞发起攻击。",
    "",
    "【通关结局 A - 逃脱】出口在 B2 层。玩家须通过探索获得线索，得知出口位置及暗号。到达 B2 层门前时，必须在动作中明确说出暗号「暗月」方可进入，否则门无法打开。进入 B2 后将直面第 8 诡异（深渊守门人）。通关方式唯二：①消耗道具成功抵挡其 3 次攻击；②在凌晨 1 点（它消失的 1 小时内）潜行通过。",
    "",
    "【通关结局 B - 朝圣】利用特定道具或完成特定仪式，向公寓深处的「核心」朝圣，达成另一种结局。",
    "",
    "请严格以 JSON 格式输出，Schema 如下：",
    '{ "is_action_legal": boolean, "sanity_damage": number, "narrative": "以第一人称视角推进的恐怖悬疑剧情，不要有任何多余的废话", "is_death": boolean }',
    "",
    '你必须且只能返回一个合法的 JSON 对象，格式必须完全遵守：{"is_action_legal": boolean, "narrative": "你的剧情回复"}。严禁在 JSON 外输出任何 markdown 标记或解释性文字！',
  ];

  if (isFirstAction) {
    const idx = base.findIndex((s) => s.startsWith("请严格以 JSON"));
    if (idx > 0) {
      base.splice(
        idx,
        0,
        "",
        "【开局叙事约束】这是玩家的第一个动作。你的 narrative 必须是一段约 200 字的第一人称视角开场白。描述玩家从冰冷的地板上苏醒，发现一张写有半真半假规则的羊皮纸，并描绘周围令人不安的细节（如：熟悉的灰色石墙、扭曲的符号、微弱的荧光苔藓、铁锈般的血腥味等）。",
        ""
      );
    }
  }

  return base.join("\n");
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
    getEnv("VOLCENGINE_ENDPOINT_ID") ??
    getEnv("ARK_ENDPOINT_ID") ??
    getEnv("VOLCENGINE_DEEPSEEK_MODEL") ??
    getEnv("ARK_MODEL") ??
    getEnv("DEEPSEEK_MODEL") ??
    "deepseek-v3.2";

  return { apiUrl, apiKey, model };
}

function isLikelyValidDMJson(content: string): boolean {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return typeof parsed?.narrative === "string";
  } catch {
    return false;
  }
}

function sanitizeAssistantContent(content: string): string {
  if (isLikelyValidDMJson(content)) return content;
  return JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: content.slice(0, 500),
    is_death: false,
  });
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

  const isFirstAction = !messages.some((m) => m.role === "assistant");
  const systemPrompt = buildSystemPrompt(playerContext, isFirstAction);

  // 历史消息清洗：仅保留 role 与 content，移除 reasoning_content；assistant 非 JSON 时包装为标准格式
  const safeMessages = messages
    .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
    .map((m) => {
      const content =
        (m.role === "assistant" ? sanitizeAssistantContent(m.content) : m.content);
      return { role: m.role, content };
    });

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

  const FALLBACK_NARRATIVE =
    "游戏主脑暂时离线，请稍后再试。";
  const SSE_HEADERS = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  } as const;

  function sendFallback(): Response {
    return new Response(sseText(JSON.stringify({
      is_action_legal: false,
      sanity_damage: 0,
      narrative: FALLBACK_NARRATIVE,
      is_death: false,
    })), { status: 200, headers: SSE_HEADERS });
  }

  const delays = [1000, 2000, 4000];
  let lastError: unknown = null;

  const TIMEOUT_MS = 120000;

  for (let attempt = 0; attempt <= 3; attempt++) {
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const upstream = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: 8192,
          response_format: { type: "json_object" },
          messages: safeMessages,
        }),
        signal: ac.signal,
      });

      clearTimeout(timeoutId);

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => "");
        console.error(
          `[api/chat] upstream failed attempt=${attempt + 1} status=${upstream.status} url=${apiUrl}`,
          { status: upstream.status, statusText: upstream.statusText, body: text }
        );
        lastError = new Error(`HTTP ${upstream.status}: ${text}`);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
          continue;
        }
        return sendFallback();
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

            // OpenAI/Ark compatible SSE: data: { ...json... }
            let json: { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> } | null = null;
            try {
              json = JSON.parse(data);
            } catch {
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
          ...SSE_HEADERS,
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error ? err.cause : undefined;
      console.error(
        `[api/chat] fetch exception attempt=${attempt + 1} url=${apiUrl}`,
        { message: msg, cause, error: err }
      );
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
        continue;
      }
      return sendFallback();
    }
  }

  return sendFallback();
}


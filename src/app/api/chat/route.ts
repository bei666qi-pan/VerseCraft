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
    "## 不可违背的世界法则",
    "",
    "【地图结构】地上 1-7 层（每层固定 1 个诡异，战力 5-9）；地下 B1 层为玩家初始复苏地；地下 B2 层为真实出口，由第 8 诡异（深渊守门人，战力 10，极高污染与攻击性）守卫。",
    "",
    "【战斗与战力碾压法则】玩家绝对无法徒手对诡异或 NPC 造成伤害。尝试徒手攻击必须判定 is_action_legal: false 并扣除理智。战斗结果严格依赖 combatPower（战力 3-10）。玩家只能通过：①特定规则道具（可抵挡致命攻击或跨越战力鸿沟击杀）；②结交高战力（9-10 分）战斗辅助型 NPC，才能对抗诡异。",
    "",
    "【NPC 互动法则】NPC 刷新于随机楼层，各有 personality（暴躁/贪婪/温和/怯懦等）和 specialty（后勤补给/战斗辅助/情报提供）。对暴躁 NPC 说错话会直接引发攻击。玩家可通过交易/话疗提升好感度获取道具，也可使用杀伤道具强行击杀 NPC 夺宝。高战力（9-10）NPC 在好感度极高时有概率能与最强诡异抗衡甚至击杀。",
    "",
    "【通关结局 A - 逃出生天】玩家须探索得知出口在 B2 层及暗号。到达 B2 门前时，必须在动作中明确说出暗号「暗月」方可开门。进入 B2 后直面第 8 诡异。离开唯二方法：①使用道具成功抵挡其 3 次攻击；②在游戏时间凌晨 1 点（它消失的一小时内）趁机潜行通过。",
    "",
    "【通关结局 S - 杀戮通关】若玩家利用极度稀有的规则类杀伤道具，或联合战力 9-10 的顶级 NPC，成功杀死公寓内全部 7 个普通诡异（1-7 层）以及第 8 诡异（B2 守门人），系统将触发隐藏 S 级结局。",
    "",
    "请严格以 JSON 格式输出，Schema 如下：",
    '{ "is_action_legal": boolean, "sanity_damage": number, "narrative": "以第一人称视角推进的恐怖悬疑剧情，不要有任何多余的废话", "is_death": boolean, "consumes_time": boolean }',
    "",
    "consumes_time：默认 true 表示本次行动消耗 1 小时。当敏捷>20 且触发「极速反应」时，必须设为 false，使玩家本次行动不消耗时间。",
    "",
    '你必须且只能返回一个合法的 JSON 对象，格式必须完全遵守上述 Schema。严禁在 JSON 外输出任何 markdown 标记或解释性文字！',
    "",
    "## 【核心属性检定与 >20 点质变法则（绝对执行）】",
    "",
    "理智 (Sanity)：<0 即死亡。理智越高越难陷入幻象。质变：理智>20 时，玩家在探索时有极大概率发现隐藏道具并获取规则提醒。",
    "",
    "敏捷 (Agility)：敏捷越高，你的 narrative 必须越长、越丰富，且玩家越容易从诡异/恶意 NPC 手中逃脱。质变：敏捷>20 时，玩家有一定概率触发「极速反应」，此时你必须在返回的 JSON 中设置 consumes_time: false，让玩家本次行动不消耗时间。",
    "",
    "幸运 (Luck)：幸运越高，越容易遇到正向事件，越难遇到恶意实体，极易发现道具。质变：幸运>20 时，玩家的普通探索有可能直接发现 A 级/S 级道具的线索，或直接看破当前楼层诡异的必杀规则。",
    "",
    "魅力 (Charm)：魅力越高，越容易获取 NPC 好感，更难引起诡异注意。质变：魅力>20 时，中立 NPC 极有可能主动出手相助，甚至诡异在必杀判定时有概率放玩家一条生路。",
    "",
    "出身 (Background)：出身越高，开局自带的道具越好（最高 A 级）。质变：出身>20 时，玩家开局即可能有一名原世界观中的 NPC 全程协助，或有 1 只诡异（非 B2 守门人）天生认识玩家并愿意提供帮助。",
  ];

  if (isFirstAction) {
    const idx = base.findIndex((s) => s.startsWith("请严格以 JSON"));
    if (idx > 0) {
      base.splice(
        idx,
        0,
        "",
        "【开局叙事强制约束】对话历史为空，这是玩家的第一个动作！你的 narrative 必须是一段约 200 字的第一人称视角开场白。你必须描写：玩家从冰冷的地板上苏醒，头痛欲裂；发现身边有一张羊皮纸，上面写着关于如月公寓的半真半假的生存规则；随后通过第一人称观察周围环境，描绘令人不安的细节（熟悉的灰色石墙、扭曲的符号、微弱的荧光苔藓、铁锈般的血腥味等）。",
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
    consumes_time: true,
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
          consumes_time: true,
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
      consumes_time: true,
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


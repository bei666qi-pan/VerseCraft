/**
 * DeepSeek Live Provider for Eval Tools
 *
 * 为 Playthrough 模拟器和 DeepEval 质量评估提供真实 LLM 调用能力。
 * 使用 DeepSeek API（OpenAI 兼容接口），不依赖现有 AI 网关。
 *
 * 用途：
 * - Player Agent（模拟玩家生成动作）
 * - Narrative Judge（叙事质量裁判评分）
 *
 * 环境变量：
 * - DEEPSEEK_API_KEY: DeepSeek API 密钥
 * - DEEPSEEK_BASE_URL: 可选，默认为 https://api.deepseek.com/v1
 * - DEEPSEEK_MODEL: 可选，默认为 deepseek-chat
 *
 * 注意：此模块仅用于 eval/测试工具，不接入生产 /api/chat 链路。
 */

// === 配置 ===

function getDeepSeekConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY 未设置。请在 .env.local 中配置或通过环境变量设置。");
  }
  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1",
    model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
  };
}

// === 类型 ===

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LiveCompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface LiveCompletionResponse {
  content: string;
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  model: string;
}

// === 核心调用 ===

/**
 * 调用 DeepSeek API 完成一次聊天补全。
 * 使用 OpenAI 兼容接口。
 */
export async function callDeepSeekCompletion(
  req: LiveCompletionRequest
): Promise<LiveCompletionResponse> {
  const config = getDeepSeekConfig();
  const startTime = Date.now();

  // 429 重试
  const MAX_RETRIES = 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 60000);

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
          response_format: req.jsonMode ? { type: "json_object" } : undefined,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const waitMs = 3000;
        console.warn(`  ⏳ 触发限流(429)，等待 ${waitMs}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`);
        clearTimeout(timeout);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`DeepSeek API error (${response.status}): ${errorText.slice(0, 500)}`);
      }

      const data = await response.json() as {
        choices: Array<{
          message: { content: string };
          finish_reason: string;
        }>;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
        model: string;
      };

      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;
      const choice = data.choices?.[0];
      if (!choice?.message?.content) {
        throw new Error("DeepSeek API 返回空内容");
      }

      return {
        content: choice.message.content,
        finishReason: choice.finish_reason ?? "unknown",
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        latencyMs,
        model: data.model ?? config.model,
      };
    } catch (e) {
      clearTimeout(timeout);
      lastError = e instanceof Error ? e : new Error(String(e));
      if (e instanceof Error && /rate_limit|429/i.test(e.message) && attempt < MAX_RETRIES) {
        const waitMs = 10000 * (attempt + 1);
        console.warn(`  ⏳ 触发限流，等待 ${waitMs}ms 后重试 (${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("DeepSeek API 重试耗尽");
}

// === 批量调用（带重试） ===

export interface BatchCompletionRequest {
  id: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface BatchCompletionResult {
  id: string;
  response: LiveCompletionResponse | null;
  error?: string;
  retries: number;
}

/**
 * 批量调用 DeepSeek API（串行，带重试）。
 */
export async function callBatchDeepSeek(
  requests: BatchCompletionRequest[],
  concurrency = 2,
  maxRetries = 2
): Promise<BatchCompletionResult[]> {
  const results: BatchCompletionResult[] = [];

  // 串行批处理 + 并发控制
  for (let i = 0; i < requests.length; i += concurrency) {
    const batch = requests.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((req) => callWithRetry(req, maxRetries))
    );
    results.push(...batchResults);
  }

  return results;
}

async function callWithRetry(
  req: BatchCompletionRequest,
  maxRetries: number
): Promise<BatchCompletionResult> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await callDeepSeekCompletion({
        messages: req.messages,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        jsonMode: req.jsonMode,
      });
      return { id: req.id, response, retries: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries) {
        // 指数退避
        await sleep(1000 * Math.pow(2, attempt));
      }
    }
  }
  return { id: req.id, response: null, error: lastError, retries: maxRetries };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// === Player Agent 专用: 生成玩家动作 ===

/**
 * 使用 DeepSeek 模拟玩家生成下一步动作。
 */
export async function generatePlayerActionDeepSeek(params: {
  persona: {
    type: string;
    name: string;
    systemPrompt: string;
  };
  stepIndex: number;
  transcript: Array<{ action: string; narrative: string }>;
  state: {
    playerLocation: string;
    hp: number;
    sanity: number;
    profession: string | null;
  };
}): Promise<string> {
  const recentHistory = params.transcript.slice(-5).map(
    (t, i) => `[回${params.stepIndex - params.transcript.length + i + 1}]\n你: ${t.action}\nDM: ${t.narrative.slice(0, 200)}`
  ).join("\n\n");

  const stateStr = `位置: ${params.state.playerLocation} | HP: ${params.state.hp} | 理智: ${params.state.sanity} | 职业: ${params.state.profession ?? "无"}`;

  const messages: ChatMessage[] = [
    { role: "system", content: params.persona.systemPrompt },
    {
      role: "user",
      content: `## 角色\n你是「${params.persona.name}」。\n\n## 当前状态\n${stateStr}\n\n## 最近对话\n${recentHistory || "（游戏刚开始）"}\n\n请以玩家身份输入下一步动作。只用简体中文，10-30字，不要解释，不要加引号。`,
    },
  ];

  const response = await callDeepSeekCompletion({
    messages,
    temperature: 0.8,
    maxTokens: 80,
    jsonMode: true,
  });

  // 通过 json_object 绕过 one-api 网关非流式 content=null 的问题
  let action = response.content.trim();
  try {
    const parsed = JSON.parse(action);
    action = parsed.text ?? parsed.action ?? parsed.content ?? parsed.response ?? action;
  } catch {
    // 若模型返回非 JSON 纯文本则直接使用
  }
  return action.replace(/^["']|["']$/g, "");
}

// === Judge 专用: 叙事质量评分 ===

/**
 * 使用 DeepSeek 对叙事文本进行五维度评分。
 */
export async function judgeNarrativeDeepSeek(params: {
  scenario: string;
  narrative: string;
  context?: string;
}): Promise<{
  dimensionScores: Record<string, number>;
  overallScore: number;
  passed: boolean;
  reasoning: string;
}> {
  const systemPrompt = `你是一位专业的中文互动叙事质量评审专家。请阅读下面的场景描述和 AI 生成的叙事文本，对五个维度进行评分（1-5分）。

评分维度：
- coherence（连贯性）: 前后文逻辑是否自洽
- characterVoice（角色口吻）: NPC 说话是否符合人物设定
- plotLogic（剧情逻辑）: 因果链是否完整合理
- immersion（代入感）: 文本能否让玩家沉浸
- factConsistency（事实一致性）: 与已设定事实是否一致

输分标准：
5分：卓越，表现突出，无明显缺陷
4分：良好，整体良好，有少量可改进之处
3分：及格，基本达标，存在明显但不致命的问题
2分：较差，存在严重问题，影响核心体验
1分：不可接受，完全失败

请严格以 JSON 格式输出。`;

  const userPrompt = `## 场景\n${params.scenario}\n\n## 上下文\n${params.context ?? "无"}\n\n## AI叙事文本\n${params.narrative}\n\n请逐维度评分，输出JSON：{"dimensionScores":{"coherence":0,"characterVoice":0,"plotLogic":0,"immersion":0,"factConsistency":0},"overallScore":0,"passed":true,"reasoning":"..."}`;

  const response = await callDeepSeekCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    maxTokens: 1024,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response.content) as Record<string, unknown>;
    return {
      dimensionScores: parsed.dimensionScores as Record<string, number> ?? {},
      overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : 3,
      passed: typeof parsed.passed === "boolean" ? parsed.passed : (typeof parsed.overallScore === "number" ? parsed.overallScore >= 3 : true),
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch {
    // JSON 解析失败，返回默认分
    const defaultScores: Record<string, number> = { coherence: 3, characterVoice: 3, plotLogic: 3, immersion: 3, factConsistency: 3 };
    return {
      dimensionScores: defaultScores,
      overallScore: 3,
      passed: false,
      reasoning: `JSON解析失败，原始内容: ${response.content.slice(0, 200)}`,
    };
  }
}

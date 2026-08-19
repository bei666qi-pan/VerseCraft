/**
 * Live OpenAI-compatible provider for eval tools.
 *
 * 为 Playthrough 模拟器和 DeepEval 质量评估提供真实 LLM 调用能力。
 * 优先使用后台“后台推演”候选；独立评测进程可显式使用 PLAYTEST_LLM_*。
 *
 * 用途：
 * - Player Agent（模拟玩家生成动作）
 * - Narrative Judge（叙事质量裁判评分）
 *
 * 环境变量：
 * - PLAYTEST_LLM_API_KEY / PLAYTEST_LLM_BASE_URL / PLAYTEST_LLM_MODEL:
 *   独立评测进程的显式测试绑定，不参与生产应用路由。
 */

// === 配置 ===

import { tryConsumeBudget } from "./harness/budgetGuard";
import { buildLiveResultCacheKey, readLiveResultCache, writeLiveResultCache } from "./harness/liveResultCache";
import { getManagedBindingsForTask } from "../ai/managed/state";

type LiveProviderConfig = {
  apiKey: string;
  endpoint: string;
  model: string;
  extraBody?: Record<string, unknown>;
};

function toChatCompletionsUrl(value: string): string {
  const base = value.replace(/\/+$/, "");
  if (base.toLowerCase().endsWith("/chat/completions")) return base;
  if (base.toLowerCase().endsWith("/v1")) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

export function resolveLiveProviderConfig(): LiveProviderConfig {
  const binding = getManagedBindingsForTask("EVAL_JUDGE")[0] ?? getManagedBindingsForTask("DEV_ASSIST")[0];
  if (binding) {
    return {
      apiKey: binding.apiKey,
      endpoint: toChatCompletionsUrl(binding.baseUrl),
      model: binding.modelName,
    };
  }

  const apiKey = process.env.PLAYTEST_LLM_API_KEY;
  if (!apiKey) {
    throw new Error("后台推演模型尚未预热；独立评测可显式设置 PLAYTEST_LLM_API_KEY。");
  }
  return {
    apiKey,
    endpoint: toChatCompletionsUrl(process.env.PLAYTEST_LLM_BASE_URL ?? "https://api.openai.com/v1"),
    model: process.env.PLAYTEST_LLM_MODEL ?? "gpt-4.1-mini",
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

// === 速率限制全局队列 ===
// RPM 配额充足时取消节流，保留全局冷却作为后端不可用时的安全阀

interface QueuedRequest {
  resolve: (response: LiveCompletionResponse) => void;
  reject: (error: Error) => void;
  request: LiveCompletionRequest;
  attempt: number;
}

const _queue: QueuedRequest[] = [];
let _lastRequestTime = 0;
let _globalCooldownUntil = 0; // 全局冷却时间戳（后端全挂时触发）
const MIN_INTERVAL_MS = 100; // 官方 DeepSeek API：~500 RPM，100ms 间隔安全
/** 每个 429 冷却期（秒），累加 */
const _429_BASE_COOLDOWN_MS = 30000;
const MAX_QUEUE_RETRIES = 2;
let _isProcessingQueue = false;

function getDelayMs(): number {
  const now = Date.now();
  // 全局冷却优先
  if (now < _globalCooldownUntil) {
    return Math.min(_globalCooldownUntil - now, 120000);
  }
  const elapsed = now - _lastRequestTime;
  return Math.max(0, MIN_INTERVAL_MS - elapsed);
}

async function processQueue(): Promise<void> {
  if (_isProcessingQueue) return;
  _isProcessingQueue = true;

  try {
    while (_queue.length > 0) {
      const delay = getDelayMs();
      if (delay > 0) {
        await sleep(delay);
      }

      const item = _queue.shift();
      if (!item) continue;

      try {
        const response = await executeSingleRequest(item.request);
        _lastRequestTime = Date.now();
        item.resolve(response);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // 402 是余额/计费硬失败，立即终止；429/503/空内容只做有上限的短重试。
        const isRetryable =
          error.message.includes("(429)") ||
          error.message.includes("(503)") ||
          error.message.includes("返回空内容");
        if (isRetryable && item.attempt < MAX_QUEUE_RETRIES) {
          const retryAfter = (error.message.includes("返回空内容") || error.message.includes("(503)"))
            ? Math.min(15000 * Math.pow(1.5, item.attempt), 120000) // 空内容/503: 15s → 23s → 34s → 51s → 76s
            : error.message.includes("(429)")
              ? Math.min(_429_BASE_COOLDOWN_MS * Math.pow(1.5, item.attempt), 120000) // 429: 30s → 45s → 68s → 102s → 120s
              : extractRetryAfter(error.message);
          console.warn(`    ⚠️ 队列重试 #${item.attempt + 1} 等待 ${Math.round(retryAfter/1000)}s: ${error.message.slice(0, 120)}`);
          await sleep(retryAfter);
          _queue.unshift({ ...item, attempt: item.attempt + 1 });
        } else {
          // 全局冷却 — 代理后端可能全挂，等待 120s 后继续尝试后续请求
          if (error.message.includes("(503)")) {
            _globalCooldownUntil = Date.now() + 120000;
            console.warn(`    ⚠️ 触发全局冷却 120s: ${error.message.slice(0, 120)}`);
          }
          item.reject(error);
        }
      }
    }
  } finally {
    _isProcessingQueue = false;
  }
}

function extractRetryAfter(errorMsg: string): number {
  const match = errorMsg.match(/retry.*?(\d+)/i) ?? errorMsg.match(/(\d+)\s*秒/i);
  const seconds = match ? parseInt(match[1], 10) : 60;
  return Math.min(Math.max(seconds * 1000, 5000), 120000); // 5s-120s
}

async function executeSingleRequest(req: LiveCompletionRequest): Promise<LiveCompletionResponse> {
  const config = resolveLiveProviderConfig();
  const startTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 90000);

  try {
    const response = await fetch(config.endpoint, {
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
        // Always disable thinking as the base; an explicit extraBody
        // can re-enable it for reasoning tasks (e.g. judge panels).
        // The ?? fallback handles undefined extraBody; an empty-object
        // extraBody ({}) would otherwise swallow the defaults.
        ...{ enable_thinking: false, thinking: { type: "disabled" } },
        ...(config.extraBody ?? {}),
      }),
      signal: controller.signal,
    });

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
  } finally {
    clearTimeout(timeout);
  }
}

// === 核心调用 ===

/**
 * 调用 DeepSeek API 完成一次聊天补全。
 * 使用 OpenAI 兼容接口，内部通过队列控制速率。
 */
export async function callDeepSeekCompletion(
  req: LiveCompletionRequest
): Promise<LiveCompletionResponse> {
  const config = resolveLiveProviderConfig();
  const cacheKey = buildLiveResultCacheKey({
    provider: "playtest_llm",
    baseUrl: config.endpoint,
    model: config.model,
    messages: req.messages,
    temperature: req.temperature ?? 0.7,
    maxTokens: req.maxTokens ?? 1024,
    jsonMode: req.jsonMode ?? false,
  });
  const cached = readLiveResultCache<LiveCompletionResponse>(cacheKey);
  if (cached) return { ...cached, latencyMs: 0 };
  if (!tryConsumeBudget("playtest_llm")) {
    throw new Error("Live eval 调用预算不足；请降低 profile 或设置 VERSECRAFT_EVAL_DAILY_CALL_BUDGET");
  }
  const response = await new Promise<LiveCompletionResponse>((resolve, reject) => {
    _queue.push({ request: req, resolve, reject, attempt: 0 });
    processQueue();
  });
  writeLiveResultCache(cacheKey, response);
  return response;
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
  /** 当前专项测试目标；只描述玩家目标，不暴露内部判定字段。 */
  campaignGoal?: string;
  /** 仅包含真实玩家可见的 UI/状态摘要。 */
  visibleSnapshot?: string;
  forbiddenActions?: string[];
}): Promise<string> {
  const recentHistory = params.transcript.slice(-5).map(
    (t, i) => `[回${params.stepIndex - params.transcript.length + i + 1}]\n你: ${t.action}\nDM: ${t.narrative.slice(0, 200)}`
  ).join("\n\n");

  const stateStr = `位置: ${params.state.playerLocation} | HP: ${params.state.hp} | 理智: ${params.state.sanity} | 职业: ${params.state.profession ?? "无"}`;

  const diversityInstruction = params.transcript.length > 5
    ? "\n\n注意：你的行动必须多样化！不要重复之前做过的动作。每次都想点之前没做过的事——去新地点、和NPC对话、检查物品、尝试互动、打开菜单、查看状态等。如果一直在做同一类动作（比如一直“前进”），立刻换一个完全不同类型的行动。"
    : "";

  const forbiddenInstruction = params.forbiddenActions && params.forbiddenActions.length > 0
    ? `\n\n禁止使用以下动作（已执行过）：${params.forbiddenActions.slice(0, 8).map(s => `「${s}」`).join("、")}\n必须使用完全不同的动作。`
    : "";

  const playerQaPrompt = `你是 VerseCraft 的黑盒玩家测试代理，不是游戏作者、DM、裁判或全知观察者。

你的目标：
1. 像真实玩家一样完成当前目标，并优先尝试尚未覆盖的交互路径。
2. 主动寻找卡死、无反馈、误导、状态矛盾、NPC认知异常和玩法边界问题。
3. 只能依据玩家可见叙事、选项、界面状态和自己此前的行动决策。

严格限制：
- 不得使用隐藏设定、数据库字段、内部 ID 或测试预期来替玩家做决定。
- 不得声称持有界面中不存在的物品、技能、知识、权限或关系。
- 每回合只执行一个具体动作；行动必须能由真实玩家输入。
- 不要解释测试策略，不要报告 bug，不要替 DM 描述结果。
- 连续两次没有新反馈时换一种行为；不要机械重复已经失败且条件未变化的动作。
- 在合理推进之外，可间歇尝试取消、重复提交、前置不足、返回旧地点、追问 NPC 等边界行为。
- 最终只输出一句简体中文玩家动作，10-30 字，不加引号、编号、JSON 或解释。`;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${playerQaPrompt}\n\n【玩家人格】\n${params.persona.systemPrompt}${diversityInstruction}${forbiddenInstruction}`,
    },
    {
      role: "user",
      content: `## 角色\n你是「${params.persona.name}」。\n\n## 本局目标\n${params.campaignGoal ?? "自然游玩并探索未覆盖内容"}\n\n## 当前可见状态\n${stateStr}\n${params.visibleSnapshot ?? ""}\n\n## 最近对话\n${recentHistory || "（游戏刚开始）"}\n\n现在只输出下一步玩家动作。`,
    },
  ];

  const response = await callDeepSeekCompletion({
    messages,
    temperature: 0.9,
    maxTokens: 150,
    timeoutMs: 90000,
  });

  return response.content.trim().replace(/^["']|["']$/g, "");
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

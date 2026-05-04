/**
 * Direct OpenAI-compatible streaming TTFT probe.
 *
 * This script bypasses /api/chat and talks to AI_GATEWAY_BASE_URL directly, while
 * mirroring the PLAYER_CHAT request shape closely enough to diagnose upstream
 * first-token latency without printing secrets.
 */
import fs from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";

import { anyAiProviderConfigured, resolveAiEnv } from "../src/lib/ai/config/envCore";
import { getProviderFactory } from "../src/lib/ai/providers";
import type { NormalizedCompletionRequest } from "../src/lib/ai/providers/types";
import type { AiLogicalRole } from "../src/lib/ai/models/logicalRoles";
import { normalizeAiLogicalRole } from "../src/lib/ai/models/logicalRoles";
import { getStablePlayerDmSystemPrefix } from "../src/lib/playRealtime/playerChatSystemPrompt";
import {
  clampPlayerChatMaxTokens,
  getTaskBinding,
  resolveOrderedRoleChain,
} from "../src/lib/ai/tasks/taskPolicy";
import { assemblePlayerChatPrompt } from "../src/lib/turnEngine/promptAssembly";
import { envRaw } from "../src/lib/config/envRaw";

type PercentileSummary = {
  p50: number | null;
  p95: number | null;
};

type GatewayRunMetrics = {
  run: number;
  role: AiLogicalRole;
  model: string;
  httpStatus: number;
  contentType: string;
  contentEncoding: string;
  transferEncoding: string;
  xAccelBuffering: string;
  gatewayHeadersMs: number | null;
  gatewayFirstTokenMs: number | null;
  gatewayFirstAnyDeltaMs: number | null;
  gatewayFinalMs: number | null;
  networkChunkCount: number;
  chunkCount: number;
  contentChunkCount: number;
  finishReason: string | null;
  error?: string;
};

type ProbeSummary = {
  runs: number;
  http200: number;
  gatewayHeadersMs: PercentileSummary;
  gatewayFirstTokenMs: PercentileSummary;
  gatewayFinalMs: PercentileSummary;
  chunkCount: PercentileSummary;
  contentChunkCount: PercentileSummary;
};

type CliOptions = {
  runs: number;
  warmupRuns: number;
  promptProfile: "small" | "app-sized";
  role: AiLogicalRole | null;
  model: string | null;
  maxTokens: number | null;
  dynamicChars: number;
  timeoutMs: number;
  acceptEncoding: string | null;
  json: boolean;
  jsonOnly: boolean;
  jsonOut: string | null;
  noExtraBody: boolean;
};

const STATUS_ENV_NAMES = [
  "AI_MODEL_MAIN",
  "AI_MODEL_CONTROL",
  "AI_PLAYER_CHAT_MAX_ROLE_CANDIDATES",
  "AI_PLAYER_CHAT_MAX_RETRIES",
  "AI_PLAYER_CHAT_AGGRESSIVE_FAILOVER",
  "AI_PLAYER_CHAT_FASTLANE_ZERO_RETRY",
  "AI_PLAYER_CHAT_FAILFAST_AUTH",
  "AI_PLAYER_CHAT_FAILFAST_RATELIMIT",
] as const;

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function parseBooleanFlag(args: string[], name: string, envName?: string): boolean {
  if (args.includes(name)) return true;
  return envName ? process.env[envName] === "1" : false;
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const roleRaw = getArgValue(args, "--role") ?? process.env.VC_GATEWAY_PROBE_ROLE ?? null;
  const role = roleRaw ? normalizeAiLogicalRole(roleRaw) : null;
  if (roleRaw && !role) {
    throw new Error(`Invalid --role=${roleRaw}; expected main/control/enhance/reasoner.`);
  }

  const runsRaw = getArgValue(args, "--runs") ?? process.env.VC_GATEWAY_PROBE_RUNS ?? "10";
  const warmupRaw = getArgValue(args, "--warmup-runs") ?? process.env.VC_GATEWAY_PROBE_WARMUP_RUNS ?? "0";
  const maxTokensRaw = getArgValue(args, "--max-tokens") ?? process.env.VC_GATEWAY_PROBE_MAX_TOKENS ?? "";
  const timeoutRaw = getArgValue(args, "--timeout-ms") ?? process.env.VC_GATEWAY_PROBE_TIMEOUT_MS ?? "";
  const promptProfileRaw =
    getArgValue(args, "--prompt-profile") ?? process.env.VC_GATEWAY_PROBE_PROMPT_PROFILE ?? "small";
  if (promptProfileRaw !== "small" && promptProfileRaw !== "app-sized") {
    throw new Error("Invalid --prompt-profile; expected small or app-sized.");
  }
  const dynamicCharsRaw =
    getArgValue(args, "--dynamic-chars") ?? process.env.VC_GATEWAY_PROBE_DYNAMIC_CHARS ?? "5200";
  const maxTokens = maxTokensRaw ? Number(maxTokensRaw) : null;

  return {
    runs: Math.max(1, Math.min(100, Number(runsRaw) || 10)),
    warmupRuns: Math.max(0, Math.min(10, Number(warmupRaw) || 0)),
    promptProfile: promptProfileRaw,
    role,
    model: getArgValue(args, "--model") ?? process.env.VC_GATEWAY_PROBE_MODEL ?? null,
    maxTokens: maxTokens != null && Number.isFinite(maxTokens) ? maxTokens : null,
    dynamicChars: Math.max(0, Math.min(30_000, Number(dynamicCharsRaw) || 5_200)),
    timeoutMs: Math.max(3_000, Math.min(180_000, Number(timeoutRaw) || 90_000)),
    acceptEncoding:
      getArgValue(args, "--accept-encoding") ?? process.env.VC_GATEWAY_PROBE_ACCEPT_ENCODING ?? null,
    json:
      args.includes("--json") ||
      args.includes("--json-only") ||
      process.env.VC_GATEWAY_PROBE_JSON === "1",
    jsonOnly: args.includes("--json-only") || process.env.VC_GATEWAY_PROBE_JSON_ONLY === "1",
    jsonOut: getArgValue(args, "--json-out") ?? process.env.VC_GATEWAY_PROBE_JSON_OUT ?? null,
    noExtraBody: parseBooleanFlag(args, "--no-extra-body", "VC_GATEWAY_PROBE_NO_EXTRA_BODY"),
  };
}

function applyDotenv(parsed: Record<string, string>, protectedKeys: ReadonlySet<string>): void {
  for (const [key, value] of Object.entries(parsed)) {
    if (protectedKeys.has(key)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    process.env[key] = value;
  }
}

function loadProjectEnvFiles(): void {
  const protectedKeys = new Set(Object.keys(process.env).filter((key) => process.env[key] !== undefined));
  for (const name of [".env", ".env.local"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!fs.existsSync(filePath)) continue;
    try {
      applyDotenv(parseDotenv(fs.readFileSync(filePath)), protectedKeys);
    } catch (err) {
      console.warn(`[probe-ai-gateway] skipped unreadable ${name}: ${String(err)}`);
    }
  }
}

function log(options: CliOptions, message = ""): void {
  if (!options.jsonOnly) console.log(message);
}

function percentile(values: number[], p: number): number | null {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const idx = Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * p) - 1));
  return clean[idx] ?? null;
}

function summarizePercentile(values: Array<number | null>): PercentileSummary {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value));
  return {
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
  };
}

function fmt(value: number | null): string {
  return value == null ? "n/a" : String(Math.round(value));
}

function summarizeRuns(runs: GatewayRunMetrics[]): ProbeSummary {
  return {
    runs: runs.length,
    http200: runs.filter((run) => run.httpStatus === 200).length,
    gatewayHeadersMs: summarizePercentile(runs.map((run) => run.gatewayHeadersMs)),
    gatewayFirstTokenMs: summarizePercentile(runs.map((run) => run.gatewayFirstTokenMs)),
    gatewayFinalMs: summarizePercentile(runs.map((run) => run.gatewayFinalMs)),
    chunkCount: summarizePercentile(runs.map((run) => run.chunkCount)),
    contentChunkCount: summarizePercentile(runs.map((run) => run.contentChunkCount)),
  };
}

function safeUrlForLog(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    return url.toString();
  } catch {
    return raw ? "(invalid-url)" : "(unset)";
  }
}

function mergeExtraBody(
  gatewayExtraBody: Record<string, unknown> | undefined,
  playerChatExtraBody: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (playerChatExtraBody && Object.keys(playerChatExtraBody).length > 0) {
    return { ...(gatewayExtraBody ?? {}), ...playerChatExtraBody };
  }
  return gatewayExtraBody;
}

function extractDeltaContent(payload: unknown): {
  content: string;
  hasAnyDelta: boolean;
  finishReason: string | null;
} {
  if (!payload || typeof payload !== "object") {
    return { content: "", hasAnyDelta: false, finishReason: null };
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { content: "", hasAnyDelta: false, finishReason: null };
  }
  const first = choices[0] as {
    delta?: Record<string, unknown>;
    finish_reason?: unknown;
  };
  const delta = first.delta && typeof first.delta === "object" ? first.delta : undefined;
  const content = typeof delta?.content === "string" ? delta.content : "";
  const finishReason = typeof first.finish_reason === "string" ? first.finish_reason : null;
  return {
    content,
    hasAnyDelta: Boolean(delta && Object.keys(delta).length > 0),
    finishReason,
  };
}

type PromptBuild = {
  messages: NormalizedCompletionRequest["messages"];
  stableCharLen: number;
  dynamicCharLen: number;
};

function buildSmallProbeMessages(): PromptBuild {
  const messages: NormalizedCompletionRequest["messages"] = [
    {
      role: "system",
      content:
        "你是 VerseCraft 的 DM。请严格以 JSON 格式输出，不要输出 Markdown。字段必须包含 is_action_legal、sanity_damage、narrative、is_death、options。",
    },
    {
      role: "user",
      content:
        "玩家行动：观察走廊。请给出一个完整但不过度扩写的中文互动叙事回合 JSON，保留悬疑氛围，并给出 3 个可行动选项。",
    },
  ];
  return {
    messages,
    stableCharLen: String(messages[0]?.content ?? "").length,
    dynamicCharLen: 0,
  };
}

function padToLength(seed: string, targetChars: number): string {
  if (seed.length >= targetChars) return seed.slice(0, targetChars);
  const parts = [seed];
  const unit =
    "\n- 场景约束：走廊灯光不稳定，公寓规则仍然有效，NPC 认知只能来自本回合可见事实，叙事必须给出结构化 JSON。";
  while (parts.join("").length < targetChars) {
    parts.push(unit);
  }
  return parts.join("").slice(0, targetChars);
}

function buildAppSizedProbeMessages(splitDualSystem: boolean, dynamicChars: number): PromptBuild {
  const stablePrefix = getStablePlayerDmSystemPrefix();
  const dynamicSeed = [
    "【本回合动态上下文】",
    "玩家当前位置：暗月公寓走廊。",
    "玩家行动：我放慢脚步，贴着墙根往走廊深处摸过去，注意听有没有脚步声。",
    "叙事预算：standard，必须保留悬疑氛围、NPC 认知边界、位置与任务状态一致性。",
    "输出要求：请严格以 JSON 格式输出，narrative 先承接上一镜头，再呈现环境反馈；options 给出可执行行动。",
  ].join("\n");
  const dynamicSuffix = padToLength(dynamicSeed, dynamicChars);
  const assembled = assemblePlayerChatPrompt({
    stablePrefix,
    dynamicSuffix,
    splitDualSystem,
    messagesToSend: [
      {
        role: "user",
        content: "观察走廊",
      },
    ],
  });
  return {
    messages: assembled.safeMessages,
    stableCharLen: assembled.stableCharLen,
    dynamicCharLen: assembled.dynamicCharLen,
  };
}

function buildProbeMessages(
  promptProfile: CliOptions["promptProfile"],
  splitDualSystem: boolean,
  dynamicChars: number
): PromptBuild {
  if (promptProfile === "app-sized") {
    return buildAppSizedProbeMessages(splitDualSystem, dynamicChars);
  }
  return [
    buildSmallProbeMessages(),
  ][0];
}

async function probeOne(
  run: number,
  role: AiLogicalRole,
  model: string,
  body: NormalizedCompletionRequest,
  url: string,
  apiKey: string,
  timeoutMs: number,
  acceptEncoding: string | null
): Promise<GatewayRunMetrics> {
  const factory = getProviderFactory();
  const init = factory.buildInit(apiKey, body);
  const headers = new Headers(init.headers);
  if (acceptEncoding) {
    headers.set("Accept-Encoding", acceptEncoding);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  let gatewayHeadersMs: number | null = null;
  let gatewayFirstTokenMs: number | null = null;
  let gatewayFirstAnyDeltaMs: number | null = null;
  let gatewayFinalMs: number | null = null;
  let networkChunkCount = 0;
  let chunkCount = 0;
  let contentChunkCount = 0;
  let finishReason: string | null = null;
  let httpStatus = 0;
  let contentType = "";
  let contentEncoding = "";
  let transferEncoding = "";
  let xAccelBuffering = "";

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    httpStatus = res.status;
    contentType = res.headers.get("content-type") ?? "";
    contentEncoding = res.headers.get("content-encoding") ?? "";
    transferEncoding = res.headers.get("transfer-encoding") ?? "";
    xAccelBuffering = res.headers.get("x-accel-buffering") ?? "";
    gatewayHeadersMs = Date.now() - t0;

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text().catch(() => "");
      return {
        run,
        role,
        model,
        httpStatus,
        contentType,
        contentEncoding,
        transferEncoding,
        xAccelBuffering,
        gatewayHeadersMs,
        gatewayFirstTokenMs,
        gatewayFirstAnyDeltaMs,
        gatewayFinalMs,
        networkChunkCount,
        chunkCount,
        contentChunkCount,
        finishReason,
        error: text ? `no_body_reader:${text.slice(0, 300)}` : "no_body_reader",
      };
    }

    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        networkChunkCount += 1;
        pending += decoder.decode(value, { stream: true });
        pending = pending.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        let eventEnd = pending.indexOf("\n\n");
        while (eventEnd >= 0) {
          const eventText = pending.slice(0, eventEnd);
          pending = pending.slice(eventEnd + 2);
          for (const rawLine of eventText.split("\n")) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            if (data === "[DONE]") {
              gatewayFinalMs = Date.now() - t0;
              continue;
            }
            chunkCount += 1;
            try {
              const parsed = JSON.parse(data) as unknown;
              const delta = extractDeltaContent(parsed);
              if (delta.hasAnyDelta && gatewayFirstAnyDeltaMs == null) {
                gatewayFirstAnyDeltaMs = Date.now() - t0;
              }
              if (delta.content.length > 0) {
                contentChunkCount += 1;
                if (gatewayFirstTokenMs == null) gatewayFirstTokenMs = Date.now() - t0;
              }
              if (delta.finishReason) finishReason = delta.finishReason;
            } catch {
              // Keep counting chunks even if a gateway emits non-JSON diagnostics.
            }
          }
          eventEnd = pending.indexOf("\n\n");
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
    }

    if (gatewayFinalMs == null) gatewayFinalMs = Date.now() - t0;
    return {
      run,
      role,
      model,
      httpStatus,
      contentType,
      contentEncoding,
      transferEncoding,
      xAccelBuffering,
      gatewayHeadersMs,
      gatewayFirstTokenMs,
      gatewayFirstAnyDeltaMs,
      gatewayFinalMs,
      networkChunkCount,
      chunkCount,
      contentChunkCount,
      finishReason,
    };
  } catch (err) {
    return {
      run,
      role,
      model,
      httpStatus,
      contentType,
      contentEncoding,
      transferEncoding,
      xAccelBuffering,
      gatewayHeadersMs,
      gatewayFirstTokenMs,
      gatewayFirstAnyDeltaMs,
      gatewayFinalMs,
      networkChunkCount,
      chunkCount,
      contentChunkCount,
      finishReason,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  loadProjectEnvFiles();
  const options = parseCli();

  if (!anyAiProviderConfigured()) {
    log(options, "[probe-ai-gateway] AI gateway not configured; skipped without request.");
    process.exit(0);
  }

  const env = resolveAiEnv();
  const binding = getTaskBinding("PLAYER_CHAT");
  const roleChain = resolveOrderedRoleChain("PLAYER_CHAT", env);
  const role = options.role ?? roleChain[0] ?? "main";
  const model = options.model ?? env.modelsByRole[role];
  if (!model) {
    throw new Error(`No model configured for role=${role}.`);
  }

  const maxTokens = clampPlayerChatMaxTokens(
    options.maxTokens ?? env.playerChatMaxTokensOverride ?? binding.maxTokens
  ).maxTokens;
  const extraBody = options.noExtraBody ? undefined : mergeExtraBody(env.gatewayExtraBody, env.playerChatExtraBody);
  const prompt = buildProbeMessages(options.promptProfile, env.splitPlayerChatDualSystem, options.dynamicChars);
  const body: NormalizedCompletionRequest = {
    modelApiName: model,
    messages: prompt.messages,
    stream: binding.stream && env.enableStream,
    maxTokens,
    temperature: binding.temperature,
    responseFormatJsonObject: binding.responseFormatJsonObject,
    streamIncludeUsage: (binding.stream && env.enableStream && env.playerChatStreamIncludeUsage) || false,
    ...(extraBody && Object.keys(extraBody).length > 0 ? { extraBody } : {}),
  };
  const requestBodyPreview = JSON.parse(
    String(getProviderFactory().buildInit("redacted", body).body ?? "{}")
  ) as Record<string, unknown>;

  const envSnapshot = {
    gatewayUrl: safeUrlForLog(env.gatewayBaseUrl),
    role,
    roleChain,
    model,
    enableStream: env.enableStream,
    requestStream: body.stream,
    acceptEncoding: options.acceptEncoding ?? "(fetch-default)",
    promptProfile: options.promptProfile,
    stableCharLen: prompt.stableCharLen,
    dynamicCharLen: prompt.dynamicCharLen,
    responseFormatJsonObject: body.responseFormatJsonObject,
    streamIncludeUsage: body.streamIncludeUsage,
    maxTokens,
    extraBodyKeys: extraBody ? Object.keys(extraBody).sort() : [],
    requestBodyFlags: {
      stream: requestBodyPreview.stream,
      response_format: requestBodyPreview.response_format,
      stream_options: requestBodyPreview.stream_options,
      extraBodyKeys: Object.keys(requestBodyPreview)
        .filter(
          (key) =>
            !["model", "messages", "stream", "max_tokens", "temperature", "response_format", "stream_options"].includes(
              key
            )
        )
        .sort(),
    },
    env: Object.fromEntries(STATUS_ENV_NAMES.map((name) => [name, envRaw(name) ?? "(default/unset)"])),
    resolvedFlags: {
      playerChatMaxRoleCandidates: env.playerChatMaxRoleCandidates,
      playerChatMaxRetries: env.playerChatMaxRetries,
      playerChatAggressiveFailover: env.playerChatAggressiveFailover,
      playerChatFastLaneZeroRetry: env.playerChatFastLaneZeroRetry,
      playerChatFailFastOnAuth: env.playerChatFailFastOnAuth,
      playerChatFailFastOnRateLimit: env.playerChatFailFastOnRateLimit,
    },
  };

  log(options, "[probe-ai-gateway] Direct streaming probe (bypasses /api/chat)");
  log(options, JSON.stringify(envSnapshot, null, 2));

  for (let i = 0; i < options.warmupRuns; i += 1) {
    await probeOne(
      0 - i,
      role,
      model,
      body,
      env.gatewayBaseUrl,
      env.gatewayApiKey,
      options.timeoutMs,
      options.acceptEncoding
    );
  }

  const runs: GatewayRunMetrics[] = [];
  for (let i = 1; i <= options.runs; i += 1) {
    const metrics = await probeOne(
      i,
      role,
      model,
      body,
      env.gatewayBaseUrl,
      env.gatewayApiKey,
      options.timeoutMs,
      options.acceptEncoding
    );
    runs.push(metrics);
    log(
      options,
      `[probe-ai-gateway] run=${i} status=${metrics.httpStatus} headers=${fmt(
        metrics.gatewayHeadersMs
      )}ms firstToken=${fmt(metrics.gatewayFirstTokenMs)}ms final=${fmt(metrics.gatewayFinalMs)}ms chunks=${
        metrics.chunkCount
      } contentChunks=${metrics.contentChunkCount} finish=${metrics.finishReason ?? "n/a"}${
        metrics.error ? ` error=${metrics.error}` : ""
      }`
    );
  }

  const summary = summarizeRuns(runs);
  const output = {
    kind: "gateway_ttft_probe",
    generatedAt: new Date().toISOString(),
    envSnapshot,
    summary,
    runs,
  };

  log(
    options,
    `[probe-ai-gateway] summary: headers p50/p95=${fmt(summary.gatewayHeadersMs.p50)}/${fmt(
      summary.gatewayHeadersMs.p95
    )}ms firstToken p50/p95=${fmt(summary.gatewayFirstTokenMs.p50)}/${fmt(
      summary.gatewayFirstTokenMs.p95
    )}ms final p50/p95=${fmt(summary.gatewayFinalMs.p50)}/${fmt(summary.gatewayFinalMs.p95)}ms`
  );

  if (options.json || options.jsonOnly) {
    const json = JSON.stringify(output, null, 2);
    if (options.jsonOnly) {
      console.log(json);
    } else {
      log(options, json);
    }
  }

  if (options.jsonOut) {
    const outPath = path.resolve(process.cwd(), options.jsonOut);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
    log(options, `[probe-ai-gateway] wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error("[probe-ai-gateway] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

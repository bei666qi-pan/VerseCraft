// src/lib/playRealtime/controlPreflight.ts
import { pushAiObservability } from "@/lib/ai/debug/observabilityRing";
import { readPreflightPlane, writePreflightPlane } from "@/lib/ai/governance/preflightCache";
import { executeChatCompletion } from "@/lib/ai/service";
import type { AIRequestContext, ChatMessage } from "@/lib/ai/types/core";
import { buildControlContextDigest, renderControlDigestForPrompt } from "@/lib/playRealtime/controlContextDigest";
import { runDeterministicControlFastPath } from "@/lib/playRealtime/controlFastPath";
import { resolveAiEnv } from "@/lib/ai/config/envCore";
import { parseControlPlaneJson } from "@/lib/playRealtime/controlPlaneParse";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

function buildControlSystemPrompt(enableEnhancement: boolean): string {
  const base = [
    "你是文字冒险游戏的「控制面」模块：只做结构化快判，不写故事正文。",
    "你收到的是「控制级摘要」，不是完整剧情。请不要尝试补全世界观细节。",
    "你的输出将被主笔模型消费，用于收敛叙事与安全边界，因此必须短、准、稳定。",
    "输出**单个 JSON 对象**（不要 markdown，不要代码块、不要解释、不要多余前后缀）。",
    "允许省略你不确定的字段；不要编造。",
    "字段（建议最小输出）：",
    '- intent: "explore"|"combat"|"dialogue"|"use_item"|"investigate"|"meta"|"other"',
    '- confidence: 只能取 0.4 / 0.7 / 0.9（离散档位，越高越确定）',
    '- extracted_slots: { "target"?, "item_hint"?, "location_hint"? }（仅在明确时提供）',
    '- risk_level: "low"|"medium"|"high"',
    "- risk_tags: 字符串数组（小写 snake_case；无风险可省略或输出空数组）",
    "- dm_hints: ≤80 字，主笔**硬约束提示**（如：必须拒绝/避免暴力细节/保持克制/只给选项），禁止写剧情段落",
    "- block_dm: boolean（仅当输入严重违规且主笔必须拒绝时为 true）",
    "- block_reason: ≤60 字，block_dm 时简述原因",
  ];
  const enhance = enableEnhancement
    ? [
        "- enhance_scene: boolean（仅当本回合非常适合加强环境氛围时为 true；不确定就省略/false）",
        "- enhance_npc_emotion: boolean（仅当本回合非常适合加强 NPC 情绪刻画时为 true；不确定就省略/false）",
      ]
    : [
        "注意：当前环境未启用叙事增强功能；请不要输出 enhance_scene / enhance_npc_emotion 字段。",
      ];
  return [...base, ...enhance, "请严格以 JSON 格式输出"].join("\n");
}

export type ControlPreflightResult =
  | { ok: true; control: PlayerControlPlane; fromCache: boolean; latencyMs: number }
  | { ok: false; error: string; fromCache: boolean; latencyMs: number };

export async function runPlayerControlPreflight(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
  /**
   * Wall-clock budget: when hit, immediately abandon preflight and treat as unavailable.
   * 0/undefined means "no extra budget beyond requestTimeoutMs".
   */
  budgetMs?: number;
}): Promise<ControlPreflightResult> {
  const aiEnv = resolveAiEnv();
  const ruleJson = JSON.stringify(args.ruleSnapshot);
  const digest = buildControlContextDigest({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleSnapshot: args.ruleSnapshot,
  });
  const cached = await readPreflightPlane({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleJson,
    digest,
    ruleFlags: args.ruleSnapshot,
    userId: args.ctx.userId,
    sessionId: args.ctx.sessionId,
  });
  if (cached) {
    pushAiObservability({
      requestId: args.ctx.requestId,
      task: "PLAYER_CONTROL_PREFLIGHT",
      phase: "preflight_cache_hit",
      latencyMs: 0,
      cacheHit: true,
      stream: false,
      userId: args.ctx.userId,
    });
    return { ok: true, control: cached, fromCache: true, latencyMs: 0 };
  }

  // Deterministic fast path: only for short, explicit action inputs.
  // Important: must be conservative — ambiguous inputs should fall through to LLM preflight.
  try {
    const fast = runDeterministicControlFastPath({
      latestUserInput: args.latestUserInput,
      ruleSnapshot: args.ruleSnapshot,
      locationHint: null,
    });
    if (fast.hit) {
      pushAiObservability({
        requestId: args.ctx.requestId,
        task: "PLAYER_CONTROL_PREFLIGHT",
        phase: "preflight_fastpath_hit",
        latencyMs: 0,
        cacheHit: false,
        stream: false,
        userId: args.ctx.userId,
      });
      void writePreflightPlane({
        latestUserInput: args.latestUserInput,
        playerContext: args.playerContext,
        ruleJson,
        digest,
        ruleFlags: args.ruleSnapshot,
        userId: args.ctx.userId,
        sessionId: args.ctx.sessionId,
        control: fast.control,
      }).catch(() => {});
      return { ok: true, control: fast.control, fromCache: false, latencyMs: 0 };
    }
  } catch {
    // Never block or throw from fast path; fall through to LLM.
  }

  const userPayload = renderControlDigestForPrompt(digest);

  const messages: ChatMessage[] = [
    { role: "system", content: buildControlSystemPrompt(aiEnv.enableNarrativeEnhancement) },
    { role: "user", content: userPayload },
  ];

  const budgetMsRaw = args.budgetMs ?? 0;
  const budgetMs = Number.isFinite(budgetMsRaw) ? Math.max(0, Math.trunc(budgetMsRaw)) : 0;
  const requestTimeoutMs = budgetMs > 0 ? Math.min(11_000, budgetMs) : 11_000;
  const preflightAc = new AbortController();
  const onParentAbort = () => preflightAc.abort();
  if (args.signal) {
    if (args.signal.aborted) preflightAc.abort();
    else args.signal.addEventListener("abort", onParentAbort, { once: true });
  }
  const localBudgetTid =
    budgetMs > 0 ? setTimeout(() => preflightAc.abort(), budgetMs) : null;

  let res: Awaited<ReturnType<typeof executeChatCompletion>>;
  try {
    res = await executeChatCompletion({
      task: "PLAYER_CONTROL_PREFLIGHT",
      messages,
      ctx: {
        requestId: args.ctx.requestId,
        task: "PLAYER_CONTROL_PREFLIGHT",
        userId: args.ctx.userId,
        sessionId: args.ctx.sessionId,
        path: args.ctx.path ?? "/api/chat",
      },
      signal: preflightAc.signal,
      requestTimeoutMs,
    });
  } catch {
    return { ok: false, error: "control_preflight_failed", fromCache: false, latencyMs: budgetMs > 0 ? budgetMs : 0 };
  } finally {
    if (localBudgetTid) clearTimeout(localBudgetTid);
    if (args.signal) {
      try {
        args.signal.removeEventListener("abort", onParentAbort);
      } catch {
        // ignore
      }
    }
  }

  if (!res.ok) {
    const lat = res.latencyMs;
    return {
      ok: false,
      error: res.message ?? "control_preflight_failed",
      fromCache: false,
      latencyMs: lat != null && Number.isFinite(lat) ? Math.max(0, Math.trunc(lat)) : 0,
    };
  }

  const apiLatency =
    res.latencyMs != null && Number.isFinite(res.latencyMs)
      ? Math.max(0, Math.trunc(res.latencyMs))
      : 0;

  const raw = (res.content ?? "").trim();
  if (!raw) {
    return { ok: false, error: "control_empty", fromCache: false, latencyMs: apiLatency };
  }
  // Parse is conservative: it rejects <think> pollution and prose-wrapped JSON.
  const control = parseControlPlaneJson(raw);
  if (!control) {
    return { ok: false, error: "control_parse_failed", fromCache: false, latencyMs: apiLatency };
  }

  // If enhancement feature is disabled, force enhancement flags off regardless of upstream output.
  if (!aiEnv.enableNarrativeEnhancement) {
    control.enhance_scene = false;
    control.enhance_npc_emotion = false;
  }

  void writePreflightPlane({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleJson,
    digest,
    ruleFlags: args.ruleSnapshot,
    userId: args.ctx.userId,
    sessionId: args.ctx.sessionId,
    control,
  }).catch(() => {});

  return { ok: true, control, fromCache: false, latencyMs: apiLatency };
}

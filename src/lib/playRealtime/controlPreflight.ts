// src/lib/playRealtime/controlPreflight.ts
import { pushAiObservability } from "@/lib/ai/debug/observabilityRing";
import { readPreflightPlane, writePreflightPlane } from "@/lib/ai/governance/preflightCache";
import { executeChatCompletion } from "@/lib/ai/service";
import type { AIRequestContext, ChatMessage } from "@/lib/ai/types/core";
import type { PlayerControlPlane, PlayerIntentKind, PlayerRuleSnapshot } from "@/lib/playRealtime/types";

const INTENT_SET = new Set<PlayerIntentKind>([
  "explore",
  "combat",
  "dialogue",
  "use_item",
  "investigate",
  "meta",
  "other",
]);

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function normalizeIntent(raw: unknown): PlayerIntentKind {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (INTENT_SET.has(s as PlayerIntentKind)) return s as PlayerIntentKind;
  return "other";
}

function normalizeRiskLevel(raw: unknown): "low" | "medium" | "high" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "medium" || s === "high" || s === "low") return s;
  return "low";
}

export function parseControlPlaneJson(text: string): PlayerControlPlane | null {
  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) clean = m[0] ?? clean;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(clean) as Record<string, unknown>;
  } catch {
    return null;
  }

  const slotsRaw = obj.extracted_slots;
  const slots =
    slotsRaw && typeof slotsRaw === "object" && !Array.isArray(slotsRaw)
      ? (slotsRaw as Record<string, unknown>)
      : {};

  const tagsRaw = obj.risk_tags;
  const risk_tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    intent: normalizeIntent(obj.intent),
    confidence: clamp01(Number(obj.confidence)),
    extracted_slots: {
      target: typeof slots.target === "string" ? slots.target : undefined,
      item_hint: typeof slots.item_hint === "string" ? slots.item_hint : undefined,
      location_hint: typeof slots.location_hint === "string" ? slots.location_hint : undefined,
      notes: typeof slots.notes === "string" ? slots.notes : undefined,
    },
    risk_tags,
    risk_level: normalizeRiskLevel(obj.risk_level),
    dm_hints: typeof obj.dm_hints === "string" ? obj.dm_hints.slice(0, 400) : "",
    enhance_scene: Boolean(obj.enhance_scene),
    enhance_npc_emotion: Boolean(obj.enhance_npc_emotion),
    block_dm: Boolean(obj.block_dm),
    block_reason: typeof obj.block_reason === "string" ? obj.block_reason.slice(0, 200) : "",
  };
}

const CONTROL_SYSTEM = [
  "你是文字冒险游戏的「控制面」模块，只做结构化推理，不写故事正文。",
  "根据玩家上下文与本回合输入，输出**单个 JSON 对象**（不要 markdown，不要代码块）。",
  "字段要求：",
  '- intent: "explore"|"combat"|"dialogue"|"use_item"|"investigate"|"meta"|"other"',
  "- confidence: 0 到 1 的小数",
  '- extracted_slots: { "target"?, "item_hint"?, "location_hint"?, "notes"? } 字符串可选',
  "- risk_tags: 字符串数组（小写 snake_case），如 political, sexual, violence, self_harm, scam, none",
  '- risk_level: "low"|"medium"|"high"',
  "- dm_hints: 不超过 200 字的简体中文，给主笔的叙事约束/重点（禁止输出可玩剧情段落）",
  "- enhance_scene: boolean — 仅当本回合适合加强**环境氛围描写**时为 true",
  "- enhance_npc_emotion: boolean — 仅当本回合有明显 NPC 情绪刻画空间时为 true",
  "- block_dm: boolean — 仅当输入严重违规且主笔必须拒绝时为 true",
  "- block_reason: 字符串，block_dm 时简述原因",
  "请严格以 JSON 格式输出",
].join("\n");

export type ControlPreflightResult =
  | { ok: true; control: PlayerControlPlane; fromCache: boolean; latencyMs: number }
  | { ok: false; error: string; fromCache: boolean; latencyMs: number };

export async function runPlayerControlPreflight(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path">;
  signal?: AbortSignal;
}): Promise<ControlPreflightResult> {
  const ruleJson = JSON.stringify(args.ruleSnapshot);
  const cached = await readPreflightPlane({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleJson,
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

  const userPayload = [
    "【规则快照（确定性）】",
    JSON.stringify(args.ruleSnapshot),
    "",
    "【玩家状态摘要（客户端）】",
    args.playerContext.slice(0, 4000),
    "",
    "【本回合输入】",
    args.latestUserInput.slice(0, 4000),
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: CONTROL_SYSTEM },
    { role: "user", content: userPayload },
  ];

  const res = await executeChatCompletion({
    task: "PLAYER_CONTROL_PREFLIGHT",
    messages,
    ctx: {
      requestId: args.ctx.requestId,
      task: "PLAYER_CONTROL_PREFLIGHT",
      userId: args.ctx.userId,
      sessionId: args.ctx.sessionId,
      path: args.ctx.path ?? "/api/chat",
    },
    signal: args.signal,
    requestTimeoutMs: 11_000,
  });

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

  const control = parseControlPlaneJson(res.content ?? "");
  if (!control) {
    return { ok: false, error: "control_parse_failed", fromCache: false, latencyMs: apiLatency };
  }

  void writePreflightPlane({
    latestUserInput: args.latestUserInput,
    playerContext: args.playerContext,
    ruleJson,
    userId: args.ctx.userId,
    sessionId: args.ctx.sessionId,
    control,
  }).catch(() => {});

  return { ok: true, control, fromCache: false, latencyMs: apiLatency };
}

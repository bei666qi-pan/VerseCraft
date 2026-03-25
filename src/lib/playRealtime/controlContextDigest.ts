// src/lib/playRealtime/controlContextDigest.ts
/**
 * 控制专用摘要构建器（Control Context Digest）
 *
 * 为什么必须瘦身：
 * - PLAYER_CONTROL_PREFLIGHT 是「辅助快判层」：意图/风险/槽位/增强开关的结构化提示。
 * - 若把剧情级上下文（大段 playerContext / 历史叙事）原样塞入，会显著增加 token 体积与上游排队/推理耗时，
 *   导致首包长尾，并放大“思考型模型”输出污染的概率。
 * - 因此这里把输入压缩为“控制级摘要”：只保留真正影响快判的线索与布尔条件。
 *
 * 兼容性原则：
 * - 仍接受上游传入的 `playerContext` 字符串（格式不做假设），但只做少量、可失败的启发式抽取。
 * - 抽取失败时也必须返回稳定摘要，不得抛错阻塞主链路。
 */

import type { PlayerRuleSnapshot } from "@/lib/playRealtime/types";

export type ControlContextDigest = {
  /** 玩家输入（短截断，避免把全文塞入控制模型）。 */
  user_input_short: string;
  /** 规则/状态布尔条件（确定性、低噪声）。 */
  rule_flags: Pick<
    PlayerRuleSnapshot,
    "in_combat_hint" | "in_dialogue_hint" | "location_changed_hint" | "high_value_scene"
  >;
  /** 从 playerContext 启发式抽取的地点信息（可能为空）。 */
  location?: { current?: string; recent?: string };
  /** 最近显著实体线索（NPC/异常/地点编码等，按文本特征抽取）。 */
  entity_hints?: string[];
  /**
   * 极短“状态变化”线索（只取关键词附近的小片段；不是把上下文全文塞入）。
   * 用于提示 control 在战斗/对话/风险上做更稳的快判。
   */
  state_change_hints?: string[];
  /**
   * 最小兜底片段：当无法抽取地点/实体时，给 control 一个极短的上下文锚点。
   * 重要：必须非常短，且只作为锚点，不承担剧情理解。
   */
  context_anchor?: string;
};

function clampText(s: unknown, max: number): string {
  const t = typeof s === "string" ? s : String(s ?? "");
  const clean = t.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > max ? clean.slice(0, max) : clean;
}

function uniqueKeepOrder(items: string[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const k = it.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

// 常见的 VerseCraft 编码（如 N-011 / A-008），用于快速抓取“显著实体线索”。
const ENTITY_CODE_RE = /\b([NA]-\d{3})\b/g;

function extractEntityHints(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ENTITY_CODE_RE)) {
    out.push(String(m[1] ?? "").toUpperCase());
  }
  // 也收集少量可能的“目标/道具”关键词片段（非常短，避免剧情化）。
  const kw = ["目标", "对象", "NPC", "道具", "物品", "地点", "房间", "街", "门", "钥匙", "药", "武器"];
  for (const k of kw) {
    const idx = text.indexOf(k);
    if (idx < 0) continue;
    const snippet = clampText(text.slice(Math.max(0, idx - 12), idx + 18), 40);
    if (snippet) out.push(snippet);
  }
  return uniqueKeepOrder(out, 8);
}

function extractLocation(text: string): { current?: string; recent?: string } | undefined {
  const t = text;
  // 启发式 1：JSON-ish 字段
  const m1 = t.match(/playerLocation"\s*:\s*"([^"]{1,80})"/i);
  const m2 = t.match(/currentLocation"\s*:\s*"([^"]{1,80})"/i);
  const cur = clampText(m1?.[1] ?? m2?.[1] ?? "", 60);
  // 启发式 2：中文标签
  const m3 = t.match(/(?:当前位置|当前地点|地点)\s*[:：]\s*([^\n]{1,80})/);
  const cur2 = clampText(m3?.[1] ?? "", 60);
  const current = cur || cur2 || undefined;

  const m4 = t.match(/(?:上一地点|上个地点|最近地点|来自)\s*[:：]\s*([^\n]{1,80})/);
  const recent = clampText(m4?.[1] ?? "", 60) || undefined;

  if (!current && !recent) return undefined;
  return { current, recent };
}

function extractStateChangeHints(text: string): string[] {
  const keys = ["生命", "理智", "sanity", "受伤", "流血", "昏迷", "获得", "失去", "进入战斗", "脱离战斗", "触发", "解锁", "封锁"];
  const out: string[] = [];
  for (const k of keys) {
    const idx = text.indexOf(k);
    if (idx < 0) continue;
    const snip = clampText(text.slice(Math.max(0, idx - 14), idx + 24), 48);
    if (snip) out.push(snip);
  }
  return uniqueKeepOrder(out, 6);
}

export function buildControlContextDigest(args: {
  latestUserInput: string;
  playerContext: string;
  ruleSnapshot: PlayerRuleSnapshot;
}): ControlContextDigest {
  const user_input_short = clampText(args.latestUserInput, 280);
  const playerContextShort = typeof args.playerContext === "string" ? args.playerContext : "";

  const rule_flags = {
    in_combat_hint: Boolean(args.ruleSnapshot.in_combat_hint),
    in_dialogue_hint: Boolean(args.ruleSnapshot.in_dialogue_hint),
    location_changed_hint: Boolean(args.ruleSnapshot.location_changed_hint),
    high_value_scene: Boolean(args.ruleSnapshot.high_value_scene),
  };

  const location = extractLocation(playerContextShort);
  const entity_hints = extractEntityHints(`${user_input_short}\n${playerContextShort}`);
  const state_change_hints = extractStateChangeHints(playerContextShort);

  // 兜底锚点：只在抽取信息不足时提供极短片段，避免把“剧情级上下文”塞回去。
  const needAnchor =
    !location?.current && !location?.recent && entity_hints.length === 0 && state_change_hints.length === 0;
  const context_anchor = needAnchor ? clampText(playerContextShort, 160) : undefined;

  return {
    user_input_short,
    rule_flags,
    ...(location ? { location } : {}),
    ...(entity_hints.length > 0 ? { entity_hints } : {}),
    ...(state_change_hints.length > 0 ? { state_change_hints } : {}),
    ...(context_anchor ? { context_anchor } : {}),
  };
}

export function renderControlDigestForPrompt(d: ControlContextDigest): string {
  // 以“可读结构化”而非长文本拼接，降低模型负担与误读概率。
  return [
    "【控制级摘要（结构化快判输入）】",
    `user_input_short: ${d.user_input_short || "(empty)"}`,
    `rule_flags: combat=${d.rule_flags.in_combat_hint} dialogue=${d.rule_flags.in_dialogue_hint} move=${d.rule_flags.location_changed_hint} high_value=${d.rule_flags.high_value_scene}`,
    d.location?.current ? `location_current: ${d.location.current}` : "",
    d.location?.recent ? `location_recent: ${d.location.recent}` : "",
    d.entity_hints && d.entity_hints.length > 0 ? `entity_hints: ${d.entity_hints.join(" | ")}` : "",
    d.state_change_hints && d.state_change_hints.length > 0
      ? `state_change_hints: ${d.state_change_hints.join(" | ")}`
      : "",
    d.context_anchor ? `context_anchor: ${d.context_anchor}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}


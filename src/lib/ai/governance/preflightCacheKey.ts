// src/lib/ai/governance/preflightCacheKey.ts
/**
 * Preflight cache key builder (pure, no server-only deps).
 *
 * 目标：
 * - 缓存“控制判定结果”，而不是缓存“臃肿上下文的偶然快照”。
 * - 使 key 对剧情级上下文波动不敏感，但仍能区分真正会影响控制快判的差异（输入、规则布尔、关键摘要线索）。
 *
 * 兼容性：
 * - 支持 newKey（digest + ruleKey + normalized input）
 * - 也支持 legacyKey（旧 fingerprint 输入），供调用方未升级时退化使用
 */

import { createHash } from "node:crypto";

export type ControlRuleFlagsCompact = {
  in_combat_hint: boolean;
  in_dialogue_hint: boolean;
  location_changed_hint: boolean;
  high_value_scene: boolean;
};

export type ControlDigestLike = {
  user_input_short?: string;
  rule_flags?: ControlRuleFlagsCompact;
  location?: { current?: string; recent?: string };
  entity_hints?: string[];
  state_change_hints?: string[];
  context_anchor?: string;
};

function sha256Hex(parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
}

export function normalizeUserInputForPreflightCache(input: string): string {
  const t = (input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  // Collapse whitespace and strip some punctuation that often changes without semantic impact.
  const collapsed = t.replace(/\s+/g, " ");
  const stripped = collapsed.replace(/[“”"'\u300c\u300d]/g, "").replace(/[，,。.!！?？；;：:]/g, "");
  // Spaces are usually non-semantic for player action inputs; removing improves cache hit rate.
  return stripped.replace(/\s+/g, "").trim().toLowerCase();
}

export function compactRuleFlags(flags: ControlRuleFlagsCompact): string {
  const c = flags.in_combat_hint ? "1" : "0";
  const d = flags.in_dialogue_hint ? "1" : "0";
  const m = flags.location_changed_hint ? "1" : "0";
  const h = flags.high_value_scene ? "1" : "0";
  // Keep stable ordering.
  return `c${c}d${d}m${m}h${h}`;
}

function stableList(xs: unknown, max: number): string {
  if (!Array.isArray(xs)) return "";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s =
      typeof x === "string"
        ? x
            .replace(/\s+/g, " ")
            .trim()
        : "";
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out.join("|");
}

export function buildPreflightFingerprintV2(args: {
  latestUserInput: string;
  digest?: ControlDigestLike | null;
  ruleFlags?: ControlRuleFlagsCompact | null;
}): string {
  const normInput = normalizeUserInputForPreflightCache(args.latestUserInput).slice(0, 220);
  const flags = args.ruleFlags ?? args.digest?.rule_flags ?? null;
  const ruleKey = flags ? compactRuleFlags(flags) : "c0d0m0h0";

  const d = args.digest ?? null;
  const locCur = d?.location?.current ? String(d.location.current).trim().slice(0, 40) : "";
  const locRec = d?.location?.recent ? String(d.location.recent).trim().slice(0, 40) : "";
  const ent = stableList(d?.entity_hints, 6).slice(0, 160);
  const changes = stableList(d?.state_change_hints, 4).slice(0, 160);
  // Anchor is intentionally tiny and only used when extraction failed (avoid key churn from large context noise).
  const shouldUseAnchor = !locCur && !locRec && !ent && !changes;
  const anchor =
    shouldUseAnchor && d?.context_anchor ? String(d.context_anchor).replace(/\s+/g, " ").trim().slice(0, 60) : "";

  return sha256Hex([
    "v2|",
    normInput,
    "|",
    ruleKey,
    "|lc:",
    locCur,
    "|lr:",
    locRec,
    "|e:",
    ent,
    "|s:",
    changes,
    "|a:",
    anchor,
  ]);
}

export function buildPreflightFingerprintLegacy(args: {
  latestUserInput: string;
  playerContext: string;
  ruleJson: string;
}): string {
  return sha256Hex([
    args.latestUserInput.slice(0, 4000),
    "|",
    args.playerContext.slice(0, 4000),
    "|",
    args.ruleJson,
  ]);
}


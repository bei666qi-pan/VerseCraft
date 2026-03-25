// src/lib/playRealtime/controlPlaneParse.ts
/**
 * 纯解析模块：从控制模型输出文本中提取 PlayerControlPlane。
 *
 * 注意：该文件必须保持“无 server-only 依赖”，以便被 node:test 单测直接导入。
 * 控制预检的缓存/网关调用仍在 `controlPreflight.ts` 中完成。
 */

import type { PlayerControlPlane, PlayerIntentKind } from "@/lib/playRealtime/types";

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

/**
 * Parse control-plane JSON. Returns null when:
 * - JSON missing/invalid
 * - Contains <think> blocks (treated as polluted output)
 */
export function parseControlPlaneJson(text: string): PlayerControlPlane | null {
  let clean = (text ?? "").replace(/```json/gi, "").replace(/```/g, "").trim();
  if (!clean) return null;
  // Treat "thinking" style outputs as polluted control-plane responses.
  if (/<think>[\s\S]*?<\/think>/i.test(clean)) return null;

  // Extract first JSON object if wrapped by prose.
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

  const dmHintsRaw = typeof obj.dm_hints === "string" ? obj.dm_hints : "";
  const dm_hints = dmHintsRaw.replace(/\s+/g, " ").trim().slice(0, 120);

  return {
    intent: normalizeIntent(obj.intent),
    confidence: clamp01(Number(obj.confidence)),
    extracted_slots: {
      target: typeof slots.target === "string" ? slots.target : undefined,
      item_hint: typeof slots.item_hint === "string" ? slots.item_hint : undefined,
      location_hint: typeof slots.location_hint === "string" ? slots.location_hint : undefined,
    },
    risk_tags,
    risk_level: normalizeRiskLevel(obj.risk_level),
    dm_hints,
    enhance_scene: Boolean(obj.enhance_scene),
    enhance_npc_emotion: Boolean(obj.enhance_npc_emotion),
    block_dm: Boolean(obj.block_dm),
    block_reason: typeof obj.block_reason === "string" ? obj.block_reason.slice(0, 200) : "",
  };
}


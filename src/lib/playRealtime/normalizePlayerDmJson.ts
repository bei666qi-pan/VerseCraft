/**
 * 将上游 DM JSON 规范为与客户端 `page.tsx` 消费逻辑等价的完整形状（缺省补 [] / 0 / true）。
 * 目的：允许模型省略默认可补字段以降低 output token；终帧与解析结果一致。
 */
import { extractFirstBalancedJsonObject } from "@/features/play/stream/dmParse";

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
}

function asUnknownArray(v: unknown): unknown[] {
  if (!Array.isArray(v)) return [];
  return v;
}

/**
 * 从流式累积文本中提取第一个平衡 JSON 对象并 parse。
 */
export function parseAccumulatedPlayerDmJson(accumulated: string): unknown | null {
  const slice = extractFirstBalancedJsonObject(accumulated.trim());
  if (!slice) return null;
  try {
    return JSON.parse(slice) as unknown;
  } catch {
    return null;
  }
}

/**
 * 校验必填四键并补齐可选字段默认值；不满足必填则返回 null（与 tryParseDM 硬门槛对齐）。
 */
export function normalizePlayerDmJson(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;

  if (typeof o.is_action_legal !== "boolean") return null;
  if (typeof o.narrative !== "string") return null;
  if (typeof o.is_death !== "boolean") return null;
  const sd = o.sanity_damage;
  if (typeof sd !== "number" || !Number.isFinite(sd)) return null;

  const out: Record<string, unknown> = {
    is_action_legal: o.is_action_legal,
    sanity_damage: sd,
    narrative: o.narrative,
    is_death: o.is_death,
    consumes_time: typeof o.consumes_time === "boolean" ? o.consumes_time : true,
    consumed_items: asStringArray(o.consumed_items),
    awarded_items: asUnknownArray(o.awarded_items),
    awarded_warehouse_items: asUnknownArray(o.awarded_warehouse_items),
    codex_updates: asUnknownArray(o.codex_updates),
    relationship_updates: asUnknownArray(o.relationship_updates),
    new_tasks: asUnknownArray(o.new_tasks),
    task_updates: asUnknownArray(o.task_updates),
    npc_location_updates: asUnknownArray(o.npc_location_updates),
  };

  if (typeof o.currency_change === "number" && Number.isFinite(o.currency_change)) {
    out.currency_change = o.currency_change;
  } else {
    out.currency_change = 0;
  }

  if (Array.isArray(o.options)) {
    const opts = o.options
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .slice(0, 4);
    if (opts.length > 0) out.options = opts;
  }

  if (typeof o.player_location === "string" && o.player_location.length > 0) {
    out.player_location = o.player_location;
  }
  if (typeof o.bgm_track === "string" && o.bgm_track.length > 0) {
    out.bgm_track = o.bgm_track;
  }
  if (o.security_meta && typeof o.security_meta === "object" && !Array.isArray(o.security_meta)) {
    out.security_meta = o.security_meta;
  }

  return out;
}

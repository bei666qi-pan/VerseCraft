/**
 * 将上游 DM JSON 规范为与客户端 `page.tsx` 消费逻辑等价的完整形状（缺省补 [] / 0 / true）。
 * 目的：允许模型省略默认可补字段以降低 output token；终帧与解析结果一致。
 */
import { sanitizeNarrativeLeakageForFinal } from "@/lib/playRealtime/protocolGuard";
import { extractBalancedJsonObjectCandidates } from "@/features/play/stream/dmParse";
import { sanitizeChapterTitleCandidate } from "@/lib/chapters/title";
import { clamp } from "@/lib/clamp";
import { normalizeNarrativeAuditPayload } from "@/lib/worldFacts/narrativeAudit";

function coerceOptionToString(x: unknown): string | null {
  if (typeof x === "string") return x.trim() || null;
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
    if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
  }
  return null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
}

function asUnknownArray(v: unknown): unknown[] {
  if (!Array.isArray(v)) return [];
  return v;
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(String(n ?? ""));
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return clamp(safe, min, max);
}

function safeJsonByteLength(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).length;
  } catch {
    return 999_999;
  }
}

function asObjectArray(v: unknown, maxLen: number): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const x of v) {
    if (out.length >= maxLen) break;
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    out.push(x as Record<string, unknown>);
  }
  return out;
}

function normalizeNarrativeAudit(v: unknown): Record<string, unknown> | null {
  return normalizeNarrativeAuditPayload(v);
}

const INTERNAL_META_ALLOWED_KEYS = new Set([
  "action",
  "request_id",
  "kind",
  "reason",
  "upstream_status",
  "upstream_code",
  "upstream_message",
  "provider",
  "lane",
]);

function normalizeInternalMeta(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return undefined;
  }
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(src)) {
    if (!INTERNAL_META_ALLOWED_KEYS.has(k)) {
      continue;
    }
    if (typeof raw === "string") {
      const text = raw.trim().slice(0, 256);
      if (text.length > 0) out[k] = text;
      continue;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      out[k] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      out[k] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const RISK_SOURCES = new Set([
  "hostile",
  "hostile_attack",
  "anomaly_attack",
  "direct_anomaly",
  "environment_hostile",
  "truth_shock",
  "trade_cost",
  "revive_residue",
  "forge_pollution",
  "relationship_debt",
  "time_loss",
  "service_cost",
  "environment",
  "unknown",
]);

function normalizeRiskSource(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return RISK_SOURCES.has(s) ? s : undefined;
}

function normalizeWeaponUpdates(v: unknown): Array<Record<string, unknown>> {
  const raw = asObjectArray(v, 24);
  const out: Array<Record<string, unknown>> = [];
  for (const u of raw) {
    const weaponId = typeof u.weaponId === "string" && u.weaponId.trim() ? u.weaponId.trim() : undefined;
    const unequip = typeof u.unequip === "boolean" ? u.unequip : undefined;
    const weapon =
      Object.prototype.hasOwnProperty.call(u, "weapon") &&
      (u.weapon === null || (!!u.weapon && typeof u.weapon === "object" && !Array.isArray(u.weapon)))
        ? (u.weapon as any)
        : undefined;
    const stability = typeof u.stability === "number" && Number.isFinite(u.stability) ? clampInt(u.stability, 0, 100) : undefined;
    const contamination = typeof u.contamination === "number" && Number.isFinite(u.contamination) ? clampInt(u.contamination, 0, 100) : undefined;
    const repairable = typeof u.repairable === "boolean" ? u.repairable : undefined;

    const calibratedThreatId =
      u.calibratedThreatId === null || typeof u.calibratedThreatId === "string"
        ? (u.calibratedThreatId as string | null)
        : undefined;
    const currentMods = Array.isArray(u.currentMods)
      ? u.currentMods.filter((x): x is string => typeof x === "string").slice(0, 6)
      : undefined;
    const currentInfusions = Array.isArray(u.currentInfusions)
      ? u.currentInfusions
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
          .map((x) => ({
            threatTag:
              x.threatTag === "liquid" || x.threatTag === "mirror" || x.threatTag === "cognition" || x.threatTag === "seal"
                ? x.threatTag
                : "liquid",
            turnsLeft: clampInt(x.turnsLeft, 0, 99),
          }))
          .slice(0, 3)
      : undefined;

    // 允许“系统守卫写入的最小更新形状”；丢弃未知字段，避免模型注入新字段穿透到前端。
    const cleaned: Record<string, unknown> = {
      ...(weaponId ? { weaponId } : {}),
      ...(unequip !== undefined ? { unequip } : {}),
      ...(weapon !== undefined ? { weapon } : {}),
      ...(stability !== undefined ? { stability } : {}),
      ...(contamination !== undefined ? { contamination } : {}),
      ...(repairable !== undefined ? { repairable } : {}),
      ...(calibratedThreatId !== undefined ? { calibratedThreatId } : {}),
      ...(currentMods !== undefined ? { currentMods } : {}),
      ...(currentInfusions !== undefined ? { currentInfusions } : {}),
    };

    if (Object.keys(cleaned).length > 0) out.push(cleaned);
  }
  return out;
}

function normalizeWeaponBagUpdates(v: unknown): Array<Record<string, unknown>> {
  const raw = asObjectArray(v, 24);
  const out: Array<Record<string, unknown>> = [];
  for (const u of raw) {
    if (typeof u.removeWeaponId === "string" && u.removeWeaponId.trim()) {
      out.push({ removeWeaponId: u.removeWeaponId.trim() });
      continue;
    }
    if (u.addWeapon && typeof u.addWeapon === "object" && !Array.isArray(u.addWeapon)) {
      out.push({ addWeapon: u.addWeapon });
      continue;
    }
    if (typeof u.addEquippedWeaponId === "string" && u.addEquippedWeaponId.trim()) {
      out.push({ addEquippedWeaponId: u.addEquippedWeaponId.trim() });
      continue;
    }
  }
  return out;
}

const VALID_FS_OPS = new Set(["plant", "reinforce", "payoff"]);

/**
 * Phase-5: 规范化 foreshadow_ops（伏笔操作列表）。
 * - 仅保留 op ∈ {plant, reinforce, payoff}
 * - text 必须为非空字符串，裁剪至 140 字符
 * - importance 限制为 1|2|3，默认 1
 * - 每回合上限 3 条
 */
function normalizeForeshadowOps(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const raw of v) {
    if (out.length >= 3) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = raw as Record<string, unknown>;
    const op = typeof o.op === "string" ? o.op.trim() : "";
    if (!VALID_FS_OPS.has(op)) continue;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    const entry: Record<string, unknown> = {
      op,
      text: text.length > 140 ? text.slice(0, 140) : text,
    };
    if (typeof o.id === "string" && o.id.trim()) entry.id = o.id.trim();
    const imp = typeof o.importance === "number" && Number.isFinite(o.importance)
      ? clamp(Math.round(o.importance), 1, 3)
      : 1;
    entry.importance = imp;
    out.push(entry);
  }
  return out;
}

/**
 * 从流式累积文本中提取第一个平衡 JSON 对象并 parse。
 */
export function parseAccumulatedPlayerDmJson(accumulated: string): unknown | null {
  const raw = String(accumulated ?? "").trim();
  if (!raw) return null;

  const candidates = extractBalancedJsonObjectCandidates(raw, 64);
  if (candidates.length === 0) return null;

  const dmRootScore = (v: unknown): number => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return 0;
    const o = v as Record<string, unknown>;
    let score = 0;
    if (typeof o.is_action_legal === "boolean") score += 4;
    if (typeof o.narrative === "string") score += 4;
    if (typeof o.is_death === "boolean") score += 3;
    if (typeof o.sanity_damage === "number" && Number.isFinite(o.sanity_damage)) score += 3;
    if (typeof o.consumes_time === "boolean") score += 1;
    if (Array.isArray(o.options)) score += 1;
    return score;
  };

  let best: { obj: unknown; score: number; idx: number } | null = null;
  let lastParseable: unknown | null = null;
  const parseCandidate = (slice: string): unknown => {
    try {
      return JSON.parse(slice) as unknown;
    } catch (strictError) {
      // Some OpenAI-compatible providers occasionally emit literal line breaks
      // or tabs inside JSON string values. Escape only those control chars;
      // never add/remove fields or repair structural braces.
      let normalized = "";
      let inString = false;
      let escaped = false;
      for (const char of slice) {
        if (escaped) { normalized += char; escaped = false; continue; }
        if (char === "\\" && inString) { normalized += char; escaped = true; continue; }
        if (char === '"') { normalized += char; inString = !inString; continue; }
        if (inString && char === "\n") { normalized += "\\n"; continue; }
        if (inString && char === "\r") { normalized += "\\r"; continue; }
        if (inString && char === "\t") { normalized += "\\t"; continue; }
        normalized += char;
      }
      if (normalized === slice) throw strictError;
      return JSON.parse(normalized) as unknown;
    }
  };
  for (let i = 0; i < candidates.length; i++) {
    const slice = candidates[i]!;
    try {
      const obj = parseCandidate(slice);
      lastParseable = obj;
      const score = dmRootScore(obj);
      if (!best || score > best.score || (score === best.score && i < best.idx)) {
        best = { obj, score, idx: i };
      }
    } catch {
      // ignore: try next candidate
    }
  }

  if (best && best.score > 0) return best.obj;
  return lastParseable;
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

  const narrativeRaw = String(o.narrative ?? "");
  const narrativeTrimmed = narrativeRaw
    // Remove markdown code fences and inline backticks to reduce “code leakage”.
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`{1,3}[^`\n]{1,120}`{1,3}/g, "")
    .trim();
  // 结构标准化阶段即做一次协议净化；若仍异常，返回 null 交由上层降级，不放行脏 narrative。
  const narrativeGuard = sanitizeNarrativeLeakageForFinal(narrativeTrimmed);
  if (narrativeGuard.degraded) {
    return null;
  }
  const narrative = narrativeGuard.narrative;

  const out: Record<string, unknown> = {
    is_action_legal: o.is_action_legal,
    sanity_damage: sd,
    narrative,
    is_death: o.is_death,
    consumes_time: typeof o.consumes_time === "boolean" ? o.consumes_time : true,
    ...(typeof o.time_cost === "string" && o.time_cost.trim() ? { time_cost: o.time_cost.trim() } : {}),
    ...(normalizeRiskSource(o.risk_source) ? { risk_source: normalizeRiskSource(o.risk_source) } : {}),
    ...(normalizeRiskSource(o.damage_source) ? { damage_source: normalizeRiskSource(o.damage_source) } : {}),
    consumed_items: asStringArray(o.consumed_items),
    consumed_warehouse_items: asStringArray(o.consumed_warehouse_items),
    awarded_items: asUnknownArray(o.awarded_items),
    awarded_warehouse_items: asUnknownArray(o.awarded_warehouse_items),
    codex_updates: asUnknownArray(o.codex_updates),
    relationship_updates: asUnknownArray(o.relationship_updates),
    main_threat_updates: asUnknownArray(o.main_threat_updates),
    weapon_updates: normalizeWeaponUpdates(o.weapon_updates),
    weapon_bag_updates: normalizeWeaponBagUpdates((o as { weapon_bag_updates?: unknown }).weapon_bag_updates),
    new_tasks: asUnknownArray(o.new_tasks),
    task_updates: asUnknownArray(o.task_updates),
    ...(o.profession_trial_result && typeof o.profession_trial_result === "object" && !Array.isArray(o.profession_trial_result)
      ? { profession_trial_result: o.profession_trial_result }
      : {}),
    clue_updates: asUnknownArray(o.clue_updates).slice(0, 48),
    npc_location_updates: asUnknownArray(o.npc_location_updates),
    foreshadow_ops: normalizeForeshadowOps(o.foreshadow_ops),
    // Always emit options (possibly empty) so clients can reliably clear stale options.
    options: [],
  };

  if (typeof o.currency_change === "number" && Number.isFinite(o.currency_change)) {
    out.currency_change = clampInt(o.currency_change, -999999, 999999);
  } else {
    out.currency_change = 0;
  }

  if (Array.isArray(o.options)) {
    const opts: string[] = [];
    for (const x of o.options) {
      if (opts.length >= 4) break;
      const s = coerceOptionToString(x);
      if (s) opts.push(s);
    }
    out.options = opts;
  }

  if (typeof o.player_location === "string" && o.player_location.length > 0) {
    out.player_location = o.player_location;
  }
  if (typeof o.bgm_track === "string" && o.bgm_track.length > 0) {
    out.bgm_track = o.bgm_track;
  }
    const nextChapterTitleCandidate = sanitizeChapterTitleCandidate(o.next_chapter_title_candidate, 32);
  if (nextChapterTitleCandidate) {
    out.next_chapter_title_candidate = nextChapterTitleCandidate;
  }
  const internalMeta = normalizeInternalMeta(o.internal_meta);
  if (internalMeta) {
    out.internal_meta = internalMeta;
  }
  const changeSetRaw = (o as { dm_change_set?: unknown }).dm_change_set;
  if (
    changeSetRaw &&
    typeof changeSetRaw === "object" &&
    !Array.isArray(changeSetRaw) &&
    safeJsonByteLength(changeSetRaw) <= 16_384
  ) {
    out.dm_change_set = changeSetRaw;
  }

  if (o.security_meta && typeof o.security_meta === "object" && !Array.isArray(o.security_meta)) {
    // 允许写入 security_meta，但限制大小，避免注入超大对象导致带宽/日志膨胀。
    try {
      const s = JSON.stringify(o.security_meta);
      out.security_meta = s.length <= 2400 ? o.security_meta : { trimmed: true };
    } catch {
      out.security_meta = { trimmed: true };
    }
  }
  const narrativeAudit = normalizeNarrativeAudit(o._narrative_audit);
  if (narrativeAudit) out._narrative_audit = narrativeAudit;

  // DM Agent 工具使用标记和状态变更摘要（Phase-10：白名单透传）
  if (typeof o.dm_agent_tools_used === "boolean") {
    out.dm_agent_tools_used = o.dm_agent_tools_used;
  }
  if (o.dm_agent_state_delta && typeof o.dm_agent_state_delta === "object" && !Array.isArray(o.dm_agent_state_delta)) {
    out.dm_agent_state_delta = o.dm_agent_state_delta;
  }

  return out;
}

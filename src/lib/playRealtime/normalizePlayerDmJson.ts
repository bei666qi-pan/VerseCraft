/**
 * 将上游 DM JSON 规范为与客户端 `page.tsx` 消费逻辑等价的完整形状（缺省补 [] / 0 / true）。
 * 目的：允许模型省略默认可补字段以降低 output token；终帧与解析结果一致。
 */
import { sanitizeNarrativeLeakageForFinal } from "@/lib/playRealtime/protocolGuard";
import { extractBalancedJsonObjectCandidates } from "@/features/play/stream/dmParse";

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
  return Math.max(min, Math.min(max, safe));
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
  for (let i = 0; i < candidates.length; i++) {
    const slice = candidates[i]!;
    try {
      const obj = JSON.parse(slice) as unknown;
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
    awarded_items: asUnknownArray(o.awarded_items),
    awarded_warehouse_items: asUnknownArray(o.awarded_warehouse_items),
    codex_updates: asUnknownArray(o.codex_updates),
    relationship_updates: asUnknownArray(o.relationship_updates),
    main_threat_updates: asUnknownArray(o.main_threat_updates),
    weapon_updates: normalizeWeaponUpdates(o.weapon_updates),
    weapon_bag_updates: normalizeWeaponBagUpdates((o as { weapon_bag_updates?: unknown }).weapon_bag_updates),
    new_tasks: asUnknownArray(o.new_tasks),
    task_updates: asUnknownArray(o.task_updates),
    clue_updates: asUnknownArray(o.clue_updates).slice(0, 48),
    npc_location_updates: asUnknownArray(o.npc_location_updates),
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

  return out;
}

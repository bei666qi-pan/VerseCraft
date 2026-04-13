import {
  normalizeGameTaskDraft,
  normalizeTaskUpdateDraft,
  type GameTaskStatus,
} from "@/lib/tasks/taskV2";
import { applyNarrativeAcceptanceDefaults, shouldAutoOpenTaskPanelForNewTask } from "@/lib/tasks/taskNarrativeGrant";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { incrFormalTaskNarrativeGrantAutoOpenCount } from "@/lib/observability/versecraftRolloutMetrics";
import { normalizeActionTimeCostKind } from "@/lib/time/actionCost";
import { isNonNarrativeOptionLike } from "@/lib/play/optionQuality";
import { hasStrongAcquireSemantics } from "@/features/play/turnCommit/semanticGuards";
import { normalizeClueUpdateArray } from "@/lib/domain/clueMerge";
import type { NarrativeDensity, TurnEnvelope, TurnMode } from "@/features/play/turnCommit/turnEnvelope";

export type ResolvedTurnUiHints = {
  auto_open_panel?: "task" | null;
  highlight_task_ids?: string[];
  toast_hint?: string | null;
  consistency_flags?: string[];
};

export type ResolvedDmTurn = TurnEnvelope;

type ResolveTurnConsistencyOptions = {
  maxNarrativeChars?: number;
  maxOptionChars?: number;
  maxSecurityMetaChars?: number;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asFiniteInt(v: unknown, fallback: number): number {
  const n =
    typeof v === "number" && Number.isFinite(v)
      ? Math.trunc(v)
      : Number(String(v ?? ""));
  const safe = Number.isFinite(n) ? Math.trunc(n) : fallback;
  return safe;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asUnknownArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asObjectArray(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
}

function asTurnMode(v: unknown): TurnMode | null {
  if (v === "narrative_only" || v === "decision_required" || v === "system_transition") return v;
  return null;
}

function asNarrativeDensity(v: unknown): NarrativeDensity | null {
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

function clampString(s: string, maxChars: number): string {
  const t = String(s ?? "");
  if (maxChars <= 0) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

function coerceOptionToString(x: unknown): string | null {
  if (typeof x === "string") return x.trim() || null;
  if (x && typeof x === "object" && !Array.isArray(x)) {
    const o = x as Record<string, unknown>;
    if (typeof o.label === "string" && o.label.trim()) return o.label.trim();
    if (typeof o.text === "string" && o.text.trim()) return o.text.trim();
  }
  return null;
}

function clampOptions(raw: unknown, maxItems: number, maxChars: number): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of src) {
    if (out.length >= maxItems) break;
    const v = coerceOptionToString(row);
    if (!v) continue;
    if (isNonNarrativeOptionLike(v)) continue;
    const clipped = clampString(v, maxChars);
    if (!clipped) continue;
    if (seen.has(clipped)) continue;
    seen.add(clipped);
    out.push(clipped);
  }
  return out;
}

function mergeSecurityMeta(existing: unknown, patch: Record<string, unknown>, maxChars: number): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const merged = { ...base, ...patch };
  try {
    const s = JSON.stringify(merged);
    return s.length <= maxChars ? merged : { trimmed: true, ...patch };
  } catch {
    return { trimmed: true, ...patch };
  }
}

function asUnknownRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/** 供客户端与反馈层复用：统一解析 `conflict_outcome` / `combat_summary` 线型。 */
export function normalizeConflictOutcome(raw: unknown): TurnEnvelope["conflict_outcome"] {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? { summary: clampString(t, 220), likelyCost: "unknown" } : null;
  }
  const o = asUnknownRecord(raw);
  if (!o) return null;
  const outcomeTier = typeof o.outcomeTier === "string"
    ? clampString(o.outcomeTier, 40)
    : (typeof o.outcome === "string" ? clampString(o.outcome, 40) : undefined);
  const resultLayer = typeof o.resultLayer === "string"
    ? clampString(o.resultLayer, 40)
    : (typeof o.layer === "string" ? clampString(o.layer, 40) : undefined);
  const summary = typeof o.summary === "string"
    ? clampString(o.summary, 220)
    : (typeof o.text === "string" ? clampString(o.text, 220) : undefined);
  const likelyCostRaw =
    typeof o.likelyCost === "string"
      ? o.likelyCost
      : typeof o.cost === "string"
        ? o.cost
        : "unknown";
  const likelyCost: TurnEnvelope["conflict_outcome"]["likelyCost"] =
    likelyCostRaw === "none" || likelyCostRaw === "light" || likelyCostRaw === "moderate" || likelyCostRaw === "heavy"
      ? likelyCostRaw
      : "unknown";
  const suggestedDirection = typeof o.suggestedDirection === "string"
    ? clampString(o.suggestedDirection, 120)
    : (typeof o.actionDirection === "string" ? clampString(o.actionDirection, 120) : undefined);
  const linkedNpcIds = asStringArray(o.linkedNpcIds ?? o.npcIds).slice(0, 6);
  if (!outcomeTier && !resultLayer && !summary && !suggestedDirection && linkedNpcIds.length === 0) return null;
  return {
    ...(outcomeTier ? { outcomeTier } : {}),
    ...(resultLayer ? { resultLayer } : {}),
    ...(summary ? { summary } : {}),
    ...(suggestedDirection ? { suggestedDirection } : {}),
    likelyCost,
    ...(linkedNpcIds.length > 0 ? { linkedNpcIds } : {}),
  };
}

function deriveCompletedTaskToast(tasks: Array<{ id: string; status?: GameTaskStatus; title?: string }>): string | null {
  const closing = tasks.filter((t) => t.status === "completed" || t.status === "failed");
  if (closing.length === 0) return null;
  const first = closing[0];
  const title = typeof first.title === "string" && first.title.trim() ? first.title.trim() : "";
  if (first.status === "completed") {
    return title ? `你完成了「${title}」。` : "你完成了一项任务。";
  }
  return title ? `「${title}」似乎失败了。` : "一项任务似乎失败了。";
}

/**
 * 保守降级：当叙事命中“强获得语义”但结构化 awarded_* 为空时，
 * 不猜物品、不发奖；仅把“已获得/已拿到”等确定性措辞降到“发现/似乎找到但未确认归属”的表述。
 * 只做局部替换（最多一次），避免破坏文风与段落结构。
 */
export function downgradeAcquireSemanticsInNarrative(narrative: string): { text: string; applied: boolean } {
  const src = String(narrative ?? "");
  if (!src) return { text: src, applied: false };
  const rules: Array<{ re: RegExp; to: string }> = [
    { re: /获得了/g, to: "发现了" },
    { re: /拿到了/g, to: "摸到了" },
    { re: /得到了/g, to: "看到了" },
    { re: /入手了/g, to: "注意到了一件" },
    { re: /收下了/g, to: "暂时收起了" },
    { re: /拾起了/g, to: "捡起了" },
    { re: /捡起了/g, to: "捡起了" },
  ];
  for (const r of rules) {
    const m = src.match(r.re);
    if (!m || m.length === 0) continue;
    const replaced = src.replace(r.re, (s, offset) => {
      // only replace first occurrence
      return offset === src.search(r.re) ? r.to : s;
    });
    if (replaced !== src) {
      // Add a very small hedge if not already present.
      const hedge = "但你还无法确认它是否真的归你所有。";
      if (!/无法确认|未确认归属|尚未确认/.test(replaced)) {
        return { text: `${replaced}\n\n${hedge}`, applied: true };
      }
      return { text: replaced, applied: true };
    }
  }
  return { text: src, applied: false };
}

export function resolveTurnConsistency(input: Record<string, unknown>, opts?: ResolveTurnConsistencyOptions): ResolvedDmTurn {
  const maxNarrativeChars = Math.max(200, Math.min(80_000, opts?.maxNarrativeChars ?? 50_000));
  const maxOptionChars = Math.max(10, Math.min(120, opts?.maxOptionChars ?? 40));
  const maxSecurityMetaChars = Math.max(200, Math.min(10_000, opts?.maxSecurityMetaChars ?? 2400));

  const ui_hints: ResolvedTurnUiHints = {};
  const consistency_flags: string[] = [];

  const baseNarrative = clampString(asString(input.narrative).trim(), maxNarrativeChars);
  const awardedItems = asUnknownArray(input.awarded_items);
  const awardedWarehouseItems = asUnknownArray(input.awarded_warehouse_items);
  const hasAwards = awardedItems.length > 0 || awardedWarehouseItems.length > 0;

  let narrative = baseNarrative;
  if (hasStrongAcquireSemantics(narrative) && !hasAwards) {
    const downgraded = downgradeAcquireSemanticsInNarrative(narrative);
    if (downgraded.applied) {
      narrative = clampString(downgraded.text, maxNarrativeChars);
      consistency_flags.push("acquire_without_awards_downgraded");
    } else {
      consistency_flags.push("acquire_without_awards_detected");
    }
  } else if (hasAwards && !hasStrongAcquireSemantics(narrative)) {
    consistency_flags.push("awards_without_explicit_acquire_text");
  }

  // Tasks: force normalize and keep only normalized outputs.
  const normalizedNewTasks = asUnknownArray(input.new_tasks)
    .map((t) => normalizeGameTaskDraft(t))
    .filter((t): t is NonNullable<ReturnType<typeof normalizeGameTaskDraft>> => !!t);
  const normalizedTaskUpdates = asUnknownArray(input.task_updates)
    .map((u) => normalizeTaskUpdateDraft(u))
    .filter((u): u is NonNullable<ReturnType<typeof normalizeTaskUpdateDraft>> => !!u);

  const nowIso = new Date().toISOString();
  const normalizedClueUpdates = normalizeClueUpdateArray((input as { clue_updates?: unknown }).clue_updates, nowIso);

  const grantNormalizedNewTasks = normalizedNewTasks.map((t) => applyNarrativeAcceptanceDefaults(t));
  const rollout = getVerseCraftRolloutFlags();
  if (rollout.enableTaskAutoOpenOnNarrativeGrant) {
    if (grantNormalizedNewTasks.some((t) => shouldAutoOpenTaskPanelForNewTask(t))) {
      const ids = grantNormalizedNewTasks.filter((t) => shouldAutoOpenTaskPanelForNewTask(t)).map((t) => t.id);
      ui_hints.auto_open_panel = "task";
      ui_hints.highlight_task_ids = ids;
      incrFormalTaskNarrativeGrantAutoOpenCount(1);
    }
  }

  const toastFromUpdates = deriveCompletedTaskToast(
    normalizedTaskUpdates.map((u) => ({
      id: u.id,
      status: (u as { status?: GameTaskStatus }).status,
      title: (u as { title?: string }).title,
    }))
  );
  if (toastFromUpdates) {
    ui_hints.toast_hint = toastFromUpdates;
  }

  const security_meta = (() => {
    if (consistency_flags.includes("acquire_without_awards_downgraded")) {
      return mergeSecurityMeta(input.security_meta, { consistency_warning: "acquire_without_awards_downgraded" }, maxSecurityMetaChars);
    }
    return input.security_meta && typeof input.security_meta === "object" && !Array.isArray(input.security_meta)
      ? mergeSecurityMeta(input.security_meta, {}, maxSecurityMetaChars)
      : undefined;
  })();

  const time_cost = normalizeActionTimeCostKind((input as { time_cost?: unknown }).time_cost);

  // --- Phase-1: new envelope fields with backward-compatible defaults ---
  const requestedMode = asTurnMode((input as { turn_mode?: unknown }).turn_mode);
  // Default must preserve legacy semantics: old turns are treated as "decision_required" (even if options is empty),
  // so route.ts auto-regeneration behavior remains unchanged unless the model explicitly opts into new modes.
  let turn_mode: TurnMode = requestedMode ?? "decision_required";

  const narrative_goal = clampString(asString((input as { narrative_goal?: unknown }).narrative_goal).trim(), 240);
  const narrative_density: NarrativeDensity =
    asNarrativeDensity((input as { narrative_density?: unknown }).narrative_density) ?? "medium";

  const rawDecisionOptions = (input as { decision_options?: unknown }).decision_options;
  const decisionOptionsFromWire = clampOptions(rawDecisionOptions, 4, maxOptionChars);
  const legacyOptionsFromWire = clampOptions(input.options, 4, maxOptionChars);

  // decision_options fallback strategy:
  // - If decision_options exists, use it.
  // - Else reuse legacy options (keeps compatibility for old DM JSON).
  let decision_options = decisionOptionsFromWire.length > 0 ? decisionOptionsFromWire : legacyOptionsFromWire;

  let decision_required = turn_mode === "decision_required";
  let decision_required_strict = asBoolean((input as { decision_required_strict?: unknown }).decision_required_strict, false);

  // Strict validation for decision_required:
  // - Must have 2~4 decision_options. If invalid, downgrade to narrative_only unless legacy options already satisfy it.
  if (turn_mode === "decision_required") {
    const cnt = decision_options.length;
    if (cnt < 2 || cnt > 4) {
      // Try legacy options as last resort (old protocol).
      const legacyCnt = legacyOptionsFromWire.length;
      if (legacyCnt >= 2 && legacyCnt <= 4) {
        decision_options = legacyOptionsFromWire;
      } else {
        // 两类矛盾需要分流处理：
        // 1) 模型显式声明 decision_required 但 payload 非法：允许降级，并明确打上 consistency flag。
        // 2) 旧协议/默认协议下（requestedMode=null）缺 options：必须保留“本轮仍是决策回合”的语义，
        //    只把 decision_options 置空，并打上 waiting_regen flag，交给 route.ts 后置补选项闭环。
        if (requestedMode === "decision_required") {
          consistency_flags.push("invalid_decision_options_downgraded");
          consistency_flags.push("invalid_decision_required_payload");
          turn_mode = "narrative_only";
          decision_required = false;
          decision_required_strict = false;
          decision_options = [];
        } else {
          consistency_flags.push("invalid_decision_options_waiting_regen");
          decision_required = true;
          decision_required_strict = false;
          decision_options = [];
        }
      }
    } else {
      decision_required = true;
    }
  } else {
    decision_required = false;
    decision_required_strict = false;
    decision_options = [];
  }

  const auto_continue_hint_raw = asString((input as { auto_continue_hint?: unknown }).auto_continue_hint).trim();
  const auto_continue_hint = auto_continue_hint_raw ? clampString(auto_continue_hint_raw, 60) : null;
  const protagonist_anchor = clampString(asString((input as { protagonist_anchor?: unknown }).protagonist_anchor).trim(), 160);
  const world_consistency_flags = asStringArray((input as { world_consistency_flags?: unknown }).world_consistency_flags).slice(0, 16);
  const anti_cheat_meta =
    (input as { anti_cheat_meta?: unknown }).anti_cheat_meta &&
    typeof (input as { anti_cheat_meta?: unknown }).anti_cheat_meta === "object" &&
    !Array.isArray((input as { anti_cheat_meta?: unknown }).anti_cheat_meta)
      ? ((input as any).anti_cheat_meta as Record<string, unknown>)
      : {};

  // options normalization policy under new modes:
  // - narrative_only: legacy options allowed but not required; keep whatever exists (compat).
  // - decision_required: keep legacy options as usual.
  // - system_transition: default forbid legacy options to prevent accidental clicks (unless explicitly provided via decision_options in future).
  const normalizedLegacyOptions =
    turn_mode === "system_transition" ? [] : legacyOptionsFromWire;
  const bgm_track =
    typeof (input as { bgm_track?: unknown }).bgm_track === "string"
      ? (input as { bgm_track: string }).bgm_track
      : undefined;
  const conflict_outcome = normalizeConflictOutcome(
    (input as { conflict_outcome?: unknown }).conflict_outcome ??
    (input as { combat_summary?: unknown }).combat_summary
  );

  const out: ResolvedDmTurn = {
    is_action_legal: asBoolean(input.is_action_legal, false),
    sanity_damage: asFiniteInt(input.sanity_damage, 0),
    narrative,
    is_death: asBoolean(input.is_death, false),
    consumes_time: asBoolean(input.consumes_time, true),
    ...(time_cost ? { time_cost } : {}),

    options: normalizedLegacyOptions,
    currency_change: asFiniteInt(input.currency_change, 0),
    consumed_items: asStringArray(input.consumed_items),
    awarded_items: awardedItems,
    awarded_warehouse_items: awardedWarehouseItems,
    codex_updates: asUnknownArray(input.codex_updates),
    relationship_updates: asUnknownArray(input.relationship_updates),
    new_tasks: grantNormalizedNewTasks,
    task_updates: normalizedTaskUpdates,
    clue_updates: normalizedClueUpdates,
    ...(typeof input.player_location === "string" && input.player_location.trim()
      ? { player_location: clampString(input.player_location.trim(), 80) }
      : {}),
    npc_location_updates: asUnknownArray(input.npc_location_updates),
    main_threat_updates: asUnknownArray(input.main_threat_updates),
    weapon_updates: asObjectArray(input.weapon_updates),
    weapon_bag_updates: asObjectArray((input as { weapon_bag_updates?: unknown }).weapon_bag_updates),
    ...(bgm_track ? { bgm_track } : {}),
    ...(security_meta ? { security_meta } : {}),
    ...(Object.keys(ui_hints).length > 0 ? { ui_hints } : {}),

    // New envelope semantic fields
    turn_mode,
    narrative_goal,
    narrative_density,
    decision_required,
    decision_options,
    decision_required_strict,
    auto_continue_hint,
    protagonist_anchor,
    world_consistency_flags,
    anti_cheat_meta,
    task_changes: {
      new_tasks: grantNormalizedNewTasks,
      task_updates: normalizedTaskUpdates,
    },
    relation_changes: {
      relationship_updates: asUnknownArray(input.relationship_updates),
    },
    conflict_outcome,
    loot_changes: {
      currency_change: asFiniteInt(input.currency_change, 0),
      consumed_items: asStringArray(input.consumed_items),
      awarded_items: awardedItems,
      awarded_warehouse_items: awardedWarehouseItems,
    },
    clue_changes: {
      clue_updates: normalizedClueUpdates,
    },
    world_state_changes: {
      ...(typeof input.player_location === "string" && input.player_location.trim()
        ? { player_location: clampString(input.player_location.trim(), 80) }
        : {}),
      npc_location_updates: asUnknownArray(input.npc_location_updates),
      main_threat_updates: asUnknownArray(input.main_threat_updates),
      weapon_updates: asObjectArray(input.weapon_updates),
      weapon_bag_updates: asObjectArray((input as { weapon_bag_updates?: unknown }).weapon_bag_updates),
      ...(bgm_track ? { bgm_track } : {}),
    },
  };

  if (consistency_flags.length > 0) {
    (out.ui_hints ??= {}).consistency_flags = consistency_flags;
  }

  return out;
}

/**
 * 入口：把“normalize+guards 之后的 dmRecord”收口为最终可提交对象（ResolvedDmTurn）。
 * 该对象是服务端最终裁决结果，不是给模型看的协议；字段完全向后兼容，旧前端仍可只消费旧字段。
 */
export function resolveDmTurn(dmRecord: Record<string, unknown>): ResolvedDmTurn {
  return resolveTurnConsistency(dmRecord, {
    maxNarrativeChars: 50_000,
    maxOptionChars: 40,
    maxSecurityMetaChars: 2400,
  });
}


import {
  normalizeGameTaskDraft,
  normalizeTaskUpdateDraft,
  type GameTaskStatus,
} from "@/lib/tasks/taskV2";
import { applyNarrativeAcceptanceDefaults, shouldAutoOpenTaskPanelForNewTask } from "@/lib/tasks/taskNarrativeGrant";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { incrFormalTaskNarrativeGrantAutoOpenCount } from "@/lib/observability/versecraftRolloutMetrics";
import { normalizeActionTimeCostKind, type ActionTimeCostKind } from "@/lib/time/actionCost";
import { hasStrongAcquireSemantics } from "@/features/play/turnCommit/semanticGuards";
import { normalizeClueUpdateArray } from "@/lib/domain/clueMerge";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";

export type ResolvedTurnUiHints = {
  auto_open_panel?: "task" | null;
  highlight_task_ids?: string[];
  toast_hint?: string | null;
  consistency_flags?: string[];
};

export type ResolvedDmTurn = {
  // Required base keys (client contract)
  is_action_legal: boolean;
  sanity_damage: number;
  narrative: string;
  is_death: boolean;
  consumes_time: boolean;
  /** 可选：细粒度时间成本（与 consumes_time 组合见 timeBudget.resolveHourProgressDelta） */
  time_cost?: ActionTimeCostKind;

  // Standardized fields (always present, never undefined)
  options: string[];
  currency_change: number;
  consumed_items: string[];
  consumed_time?: never;
  awarded_items: unknown[];
  awarded_warehouse_items: unknown[];
  codex_updates: unknown[];
  relationship_updates: unknown[];
  new_tasks: unknown[];
  task_updates: unknown[];
  /** 手记线索增量（阶段 2+）；旧前端可忽略 */
  clue_updates: ClueEntry[];
  player_location?: string;
  npc_location_updates: unknown[];
  main_threat_updates: unknown[];
  weapon_updates: Array<Record<string, unknown>>;
  weapon_bag_updates: Array<Record<string, unknown>>;

  // Security / audit info (kept small)
  security_meta?: Record<string, unknown>;

  // Phase-1 light interaction hints (optional)
  ui_hints?: ResolvedTurnUiHints;

  // Keep legacy optional keys if present
  bgm_track?: string;
};

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

function clampString(s: string, maxChars: number): string {
  const t = String(s ?? "");
  if (maxChars <= 0) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

function clampOptions(raw: unknown, maxItems: number, maxChars: number): string[] {
  const src = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of src) {
    if (out.length >= maxItems) break;
    if (typeof row !== "string") continue;
    const v = row.trim();
    if (!v) continue;
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

  if (consistency_flags.length > 0) {
    ui_hints.consistency_flags = consistency_flags;
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

  const out: ResolvedDmTurn = {
    is_action_legal: asBoolean(input.is_action_legal, false),
    sanity_damage: asFiniteInt(input.sanity_damage, 0),
    narrative,
    is_death: asBoolean(input.is_death, false),
    consumes_time: asBoolean(input.consumes_time, true),
    ...(time_cost ? { time_cost } : {}),

    options: clampOptions(input.options, 4, maxOptionChars),
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
    ...(typeof (input as { bgm_track?: unknown }).bgm_track === "string" ? { bgm_track: (input as any).bgm_track } : {}),
    ...(security_meta ? { security_meta } : {}),
    ...(Object.keys(ui_hints).length > 0 ? { ui_hints } : {}),
  };

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


/**
 * 将可选 `dm_change_set` 折叠为既有 DM legacy 字段。
 * 模型只提交候选；正式目标/线索/发奖由规则裁剪后再走 normalizeDmTaskPayload / resolveDmTurn。
 */
import { ITEMS } from "@/lib/registry/items";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { normalizeGameTaskDraft } from "@/lib/tasks/taskV2";
import { normalizeClueDraft } from "@/lib/domain/clueMerge";
import { dmChangeSetSchemaV1, type DmChangeSetV1, type ObjectiveCandidateV1 } from "./schema";
import { dmChangeSetDebugLog } from "./debug";

const MAX_NEW_TASKS_FROM_CHANGESET = 2;
const MAX_CLUES_FROM_CHANGESET = 8;
const MAX_OBTAINED_FROM_CHANGESET = 3;
const MAX_LEGACY_NEW_TASKS_WHEN_CHANGESET = 1;

function mergeSecurityMeta(dm: Record<string, unknown>, patch: Record<string, unknown>): void {
  const prev =
    dm.security_meta && typeof dm.security_meta === "object" && !Array.isArray(dm.security_meta)
      ? (dm.security_meta as Record<string, unknown>)
      : {};
  dm.security_meta = { ...prev, ...patch };
}

function itemByRegistryId(id: string) {
  return ITEMS.find((i) => i.id === id);
}

/** 弱校验：标题前若干字出现在叙事中，或模型声明已露出，或主线 id */
export function isObjectivePlayerPerceived(c: ObjectiveCandidateV1, narrative: string): boolean {
  if (c.surfaced_in_narrative === true) return true;
  if (c.id.startsWith("main_")) return true;
  const t = c.title.trim();
  if (t.length < 2) return false;
  const head = t.slice(0, Math.min(8, t.length));
  return narrative.includes(head);
}

function allowObtainedItem(args: {
  itemId: string;
  tierHint?: "S" | "A" | "B" | "C" | "D";
  isKeyItem?: boolean;
  inventoryIds: string[];
  warehouseIds: string[];
}): { ok: true } | { ok: false; reason: string } {
  const reg = itemByRegistryId(args.itemId);
  if (reg) {
    if (args.isKeyItem && (args.inventoryIds.includes(args.itemId) || args.warehouseIds.includes(args.itemId))) {
      return { ok: false, reason: "duplicate_key_item" };
    }
    return { ok: true };
  }
  const th = args.tierHint ?? "B";
  if (th === "S" || th === "A") {
    return { ok: false, reason: "high_tier_unknown_id" };
  }
  if (args.isKeyItem && (args.inventoryIds.includes(args.itemId) || args.warehouseIds.includes(args.itemId))) {
    return { ok: false, reason: "duplicate_key_item" };
  }
  return { ok: true };
}

function collectCandidates(cs: DmChangeSetV1): ObjectiveCandidateV1[] {
  const buckets = [
    ...(cs.objective_candidates ?? []),
    ...(cs.commissions ?? []),
    ...(cs.npc_promises ?? []),
  ];
  const byId = new Map<string, ObjectiveCandidateV1>();
  for (const c of buckets) {
    if (!c.id || !c.title) continue;
    byId.set(c.id, c);
  }
  return [...byId.values()];
}

/**
 * @param dm 已通过 normalizePlayerDmJson 的 record（会原地修改并删除 dm_change_set）
 */
export function applyDmChangeSetToDmRecord(
  dm: Record<string, unknown>,
  ctx: { clientState: ClientStructuredContextV1 | null; requestId?: string }
): Record<string, unknown> {
  const raw = dm.dm_change_set;
  delete dm.dm_change_set;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return dm;
  }

  const parsed = dmChangeSetSchemaV1.safeParse(raw);
  const trace: string[] = [];
  const sourceTag = "dm_change_set:v1";

  if (!parsed.success) {
    trace.push(`schema_reject:${String(parsed.error).slice(0, 200)}`);
    mergeSecurityMeta(dm, {
      change_set_applied: false,
      change_set_trace: trace,
    });
    dmChangeSetDebugLog("schema_reject", { requestId: ctx.requestId, issues: parsed.error.issues.slice(0, 6) });
    return dm;
  }

  const cs = parsed.data;
  const narrative = String(dm.narrative ?? "");
  const inv = ctx.clientState?.inventoryItemIds ?? [];
  const wh = ctx.clientState?.warehouseItemIds ?? [];

  if (cs.narrative_text && narrative.length < 20) {
    dm.narrative = String(cs.narrative_text).slice(0, 50_000);
    trace.push("narrative_filled_from_change_set");
  }

  if (cs.time_pressure || (cs.world_risks && cs.world_risks.length > 0)) {
    mergeSecurityMeta(dm, {
      change_set_hints: {
        time_pressure: cs.time_pressure ?? "none",
        world_risks: (cs.world_risks ?? []).slice(0, 6),
      },
    });
  }

  const clueBuf: unknown[] = Array.isArray(dm.clue_updates) ? [...dm.clue_updates] : [];
  const nowIso = new Date().toISOString();
  let clueAdded = 0;
  for (const cl of cs.discovered_clues ?? []) {
    if (clueAdded >= MAX_CLUES_FROM_CHANGESET) break;
    const entry = normalizeClueDraft(
      {
        title: cl.title,
        detail: cl.detail ?? cl.title,
        kind: cl.kind ?? "unverified",
        source: "dm",
        acquisitionSource: sourceTag,
        ...(cl.matures_to_objective_id ? { maturesToObjectiveId: cl.matures_to_objective_id } : {}),
        trace: {
          channel: "dm_change_set",
          audit: [ctx.requestId ? `discovered_clue:${String(ctx.requestId).slice(0, 12)}` : "discovered_clue"],
        },
      },
      nowIso
    );
    if (entry) {
      clueBuf.push({
        ...entry,
        triggerSource: sourceTag,
      });
      clueAdded++;
      trace.push(`clue:${entry.id}`);
    }
  }

  let awardAdded = 0;
  const awards: unknown[] = Array.isArray(dm.awarded_items) ? [...dm.awarded_items] : [];
  for (const o of cs.obtained_items ?? []) {
    if (awardAdded >= MAX_OBTAINED_FROM_CHANGESET) break;
    const gate = allowObtainedItem({
      itemId: o.item_id,
      tierHint: o.tier_hint,
      isKeyItem: o.is_key_item,
      inventoryIds: inv,
      warehouseIds: wh,
    });
    if (!gate.ok) {
      trace.push(`obtained_reject:${o.item_id}:${gate.reason}`);
      continue;
    }
    awards.push(o.item_id);
    awardAdded++;
    trace.push(`award:${o.item_id}`);
  }
  if (awards.length > 0) dm.awarded_items = awards;

  const consumed: string[] = Array.isArray(dm.consumed_items)
    ? [...(dm.consumed_items as unknown[]).filter((x): x is string => typeof x === "string")]
    : [];
  for (const ch of cs.item_state_changes ?? []) {
    if (ch.action === "consume") {
      const reg = itemByRegistryId(ch.item_id);
      const label = reg?.name ?? ch.item_id;
      if (!consumed.includes(label)) consumed.push(label);
      trace.push(`consume:${ch.item_id}`);
    }
  }
  if (consumed.length > 0) dm.consumed_items = consumed;

  const rel: unknown[] = Array.isArray(dm.relationship_updates) ? [...dm.relationship_updates] : [];
  for (const r of cs.relationship_impacts ?? []) {
    rel.push({ ...r });
    trace.push(`rel:${r.npcId}`);
  }
  if (rel.length > 0) dm.relationship_updates = rel;

  const candidates = collectCandidates(cs);
  const newTasks: unknown[] = Array.isArray(dm.new_tasks) ? [...dm.new_tasks] : [];
  if (newTasks.length > MAX_LEGACY_NEW_TASKS_WHEN_CHANGESET) {
    const dropped = newTasks.length - MAX_LEGACY_NEW_TASKS_WHEN_CHANGESET;
    dm.new_tasks = newTasks.slice(0, MAX_LEGACY_NEW_TASKS_WHEN_CHANGESET);
    trace.push(`legacy_new_tasks_truncated:${dropped}`);
    dmChangeSetDebugLog("truncated_legacy_new_tasks", { requestId: ctx.requestId, dropped });
  }

  let promoted = 0;
  const currentNew = Array.isArray(dm.new_tasks) ? [...dm.new_tasks] : [];
  const existingIds = new Set(
    currentNew
      .map((t) => (t && typeof t === "object" && !Array.isArray(t) ? (t as { id?: string }).id : null))
      .filter((x): x is string => typeof x === "string" && x.length > 0)
  );

  for (const c of candidates) {
    if (promoted >= MAX_NEW_TASKS_FROM_CHANGESET) break;
    if (!isObjectivePlayerPerceived(c, narrative)) {
      trace.push(`objective_skip_unseen:${c.id}`);
      const clue = normalizeClueDraft(
        {
          title: `未露出目标候选：${c.title}`,
          detail: c.desc ?? "系统在叙事中未检测到玩家可见提示，已降级为线索。",
          kind: "unverified",
          relatedObjectiveId: c.id,
          maturesToObjectiveId: c.id,
          acquisitionSource: sourceTag,
          trace: {
            channel: "dm_change_set",
            audit: [
              `demoted_objective:${c.id}`,
              ctx.requestId ? `req:${String(ctx.requestId).slice(0, 12)}` : "demoted",
            ],
          },
        },
        nowIso
      );
      if (clue && clueAdded < MAX_CLUES_FROM_CHANGESET) {
        clueBuf.push({ ...clue, triggerSource: sourceTag });
        clueAdded++;
      }
      continue;
    }
    if (existingIds.has(c.id)) {
      trace.push(`objective_dup:${c.id}`);
      continue;
    }
    const inferredKind = c.goal_kind ?? (c.id.startsWith("main_") ? "main" : "commission");
    const draft = normalizeGameTaskDraft({
      id: c.id,
      title: c.title,
      desc: c.desc ?? "",
      type: inferredKind === "main" || c.id.startsWith("main_") ? "main" : "character",
      issuerId: c.issuer_id ?? "unknown_issuer",
      issuerName: c.issuer_name ?? "未知委托人",
      status: "available",
      goalKind: inferredKind,
      reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
      ...(c.required_item_ids && c.required_item_ids.length > 0 ? { requiredItemIds: c.required_item_ids } : {}),
      ...(c.source_clue_id ? { sourceClueIds: [c.source_clue_id] } : {}),
      narrativeTrace: {
        channel: "dm_change_set",
        audit: [
          `promoted:${c.id}`,
          ...(ctx.requestId ? [`req:${String(ctx.requestId).slice(0, 12)}`] : []),
        ],
      },
    });
    if (!draft) {
      trace.push(`objective_invalid_draft:${c.id}`);
      continue;
    }
    currentNew.push(draft);
    existingIds.add(c.id);
    promoted++;
    trace.push(`objective_promoted:${c.id}`);
  }

  const capTotal = MAX_LEGACY_NEW_TASKS_WHEN_CHANGESET + MAX_NEW_TASKS_FROM_CHANGESET;
  dm.new_tasks = currentNew.slice(0, capTotal);
  if (currentNew.length > capTotal) {
    trace.push(`new_tasks_cap:${currentNew.length - capTotal}`);
  }

  if (clueBuf.length > 0) {
    dm.clue_updates = clueBuf;
  }

  mergeSecurityMeta(dm, {
    change_set_applied: true,
    change_set_trace: trace.slice(0, 48),
    change_set_source_tag: sourceTag,
  });

  dmChangeSetDebugLog("applied", {
    requestId: ctx.requestId,
    trace: trace.slice(0, 24),
    promoted,
    clueAdded,
    awardAdded,
  });

  return dm;
}

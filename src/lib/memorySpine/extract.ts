import type { MemoryCandidateDraft } from "./reducer";
import type { MemorySpineSource } from "./types";

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function floorFromLocation(loc: string): string {
  const s = String(loc ?? "");
  if (s.startsWith("B1_")) return "B1";
  if (s.startsWith("B2_")) return "B2";
  const m = s.match(/^(\d)F_/);
  if (m?.[1]) return m[1];
  if (s.includes("7F") || s === "7") return "7";
  return "B1";
}

type ExtractInput = {
  nowHour: number;
  resolvedTurn: any;
  before: {
    playerLocation: string;
    activeTaskIds: string[];
    presentNpcIds: string[];
    mainThreatByFloor: Record<string, { floorId: string; phase: string }>;
  };
  after: {
    playerLocation: string;
    tasks: Array<{ id: string; title: string; status: string; issuerId?: string; issuerName?: string; floorTier?: string }>;
    codex: Record<string, { id: string; type: string; name: string; favorability?: number; trust?: number; fear?: number; debt?: number }>;
    mainThreatByFloor: Record<string, { floorId: string; threatId: string; phase: string; suppressionProgress?: number }>;
  };
  enableNarrativeMicroPatterns?: boolean;
};

function push(out: MemoryCandidateDraft[], row: MemoryCandidateDraft) {
  const s = typeof row.summary === "string" ? row.summary.trim() : "";
  if (!s) return;
  out.push({ ...row, summary: s.slice(0, 80) });
}

export function extractMemoryCandidates(input: ExtractInput): MemoryCandidateDraft[] {
  const out: MemoryCandidateDraft[] = [];
  const nowHour = input.nowHour;
  const resolved = input.resolvedTurn ?? {};
  const locAfter = input.after.playerLocation ?? input.before.playerLocation ?? "B1_SafeZone";
  const floorAfter = floorFromLocation(locAfter);

  // 1) location change -> route_hint (very light)
  const locBefore = input.before.playerLocation ?? "B1_SafeZone";
  if (locAfter && locBefore && locAfter !== locBefore) {
    push(out, {
      kind: "route_hint",
      scope: "location_local",
      summary: `你已抵达${locAfter}。`,
      salience: 0.42,
      confidence: 0.92,
      status: "active",
      ttlHours: 18,
      mergeKey: `loc:${locAfter}`,
      anchors: { locationIds: [locAfter], floorIds: [floorAfter] },
      recallTags: ["loc_arrival"],
      source: "location_change" satisfies MemorySpineSource,
      promoteToLore: false,
    });
  }

  // 2) new_tasks -> task_residue (+ hook-like if npc_grant)
  const newTasks = Array.isArray(resolved.new_tasks) ? resolved.new_tasks : [];
  for (const t of newTasks) {
    const id = asString(t?.id);
    const title = asString(t?.title) || "新的委托";
    if (!id) continue;
    const issuerId = asString(t?.issuerId);
    const floorTier = asString(t?.floorTier) || "";
    push(out, {
      kind: "task_residue",
      scope: issuerId ? "npc_local" : "run_private",
      summary: `接到委托「${title}」。`,
      salience: 0.7,
      confidence: 0.92,
      status: "active",
      ttlHours: 72,
      mergeKey: `task:${id}`,
      anchors: { taskIds: [id], npcIds: issuerId ? [issuerId] : undefined, floorIds: floorTier ? [floorTier] : undefined },
      recallTags: ["task_new"],
      source: "task_update",
      promoteToLore: false,
    });
  }

  // 3) task_updates -> promise/debt/escape_condition (conservative) + resolved markers
  const taskUpdates = Array.isArray(resolved.task_updates) ? resolved.task_updates : [];
  for (const u of taskUpdates) {
    const id = asString(u?.id);
    const status = asString(u?.status);
    if (!id || !status) continue;
    if (status === "completed") {
      push(out, {
        kind: "promise",
        scope: "run_private",
        summary: `你兑现并完成了一个委托（${id}）。`,
        salience: 0.78,
        confidence: 0.88,
        status: "resolved",
        ttlHours: 96,
        mergeKey: `task_done:${id}`,
        anchors: { taskIds: [id], floorIds: [floorAfter] },
        recallTags: ["task_completed"],
        source: "task_update",
        promoteToLore: true,
      });
    }
    if (status === "failed") {
      push(out, {
        kind: "debt",
        scope: "run_private",
        summary: `你失手导致一个委托失败（${id}）。`,
        salience: 0.72,
        confidence: 0.84,
        status: "active",
        ttlHours: 72,
        mergeKey: `task_fail:${id}`,
        anchors: { taskIds: [id], floorIds: [floorAfter] },
        recallTags: ["task_failed"],
        source: "task_update",
        promoteToLore: false,
      });
    }
  }

  // 4) relationship_updates -> relationship_shift per npc (mergeKey locks per npc)
  const rel = Array.isArray(resolved.relationship_updates) ? resolved.relationship_updates : [];
  for (const r of rel) {
    const npcId = asString((r as any)?.npcId);
    if (!npcId) continue;
    const deltaKeys = ["favorability", "trust", "fear", "debt", "affection", "desire"] as const;
    const deltas: string[] = [];
    for (const k of deltaKeys) {
      const v = (r as any)?.[k];
      if (typeof v === "number" && Number.isFinite(v)) deltas.push(`${k}${v >= 0 ? "+" : ""}${Math.trunc(v)}`);
    }
    if (deltas.length === 0) continue;
    push(out, {
      kind: "relationship_shift",
      scope: "npc_local",
      summary: `你与${npcId}的关系发生变化（${deltas.slice(0, 3).join("，")}）。`,
      salience: 0.66,
      confidence: 0.86,
      status: "active",
      ttlHours: 72,
      mergeKey: `rel:${npcId}`,
      anchors: { npcIds: [npcId], locationIds: [locAfter], floorIds: [floorAfter] },
      recallTags: ["rel_shift"],
      source: "relationship_update",
      promoteToLore: false,
    });
  }

  // 5) threats -> danger_hint when phase becomes hot
  const threats = Array.isArray(resolved.main_threat_updates) ? resolved.main_threat_updates : [];
  for (const u of threats) {
    if (!u || typeof u !== "object" || Array.isArray(u)) continue;
    const floorId = asString((u as any).floorId) || floorAfter;
    const phase = asString((u as any).phase);
    if (phase !== "active" && phase !== "suppressed" && phase !== "breached") continue;
    push(out, {
      kind: "danger_hint",
      scope: "session_world",
      summary: `主威胁在${floorId}进入高压阶段（${phase}）。`,
      salience: 0.74,
      confidence: 0.86,
      status: "active",
      ttlHours: 36,
      mergeKey: `threat:${floorId}`,
      anchors: { floorIds: [floorId], locationIds: [locAfter] },
      recallTags: ["threat_hot"],
      source: "threat_update",
      promoteToLore: true,
    });
  }

  // 6) awards -> item_provenance (short; avoid narrative)
  const awardIds: string[] = [];
  for (const row of Array.isArray(resolved.awarded_items) ? resolved.awarded_items : []) {
    if (typeof row === "string") awardIds.push(row.trim());
    else if (row && typeof row === "object" && typeof (row as any).id === "string") awardIds.push(String((row as any).id).trim());
  }
  for (const row of Array.isArray(resolved.awarded_warehouse_items) ? resolved.awarded_warehouse_items : []) {
    if (typeof row === "string") awardIds.push(row.trim());
    else if (row && typeof row === "object" && typeof (row as any).id === "string") awardIds.push(String((row as any).id).trim());
  }
  for (const id of awardIds.filter(Boolean).slice(0, 6)) {
    push(out, {
      kind: "item_provenance",
      scope: "run_private",
      summary: `你获得了物品${id}。`,
      salience: 0.55,
      confidence: 0.9,
      status: "active",
      ttlHours: 48,
      mergeKey: `item:${id}`,
      anchors: { itemIds: [id], locationIds: [locAfter], floorIds: [floorAfter] },
      recallTags: ["award"],
      source: "resolved_turn",
      promoteToLore: false,
    });
  }

  // 7) death mark (if provided)
  if (resolved.is_death === true) {
    push(out, {
      kind: "death_mark",
      scope: "run_private",
      summary: `你在${locAfter}死亡过一次。`,
      salience: 0.82,
      confidence: 0.92,
      status: "active",
      ttlHours: 120,
      mergeKey: `death:${locAfter}`,
      anchors: { locationIds: [locAfter], floorIds: [floorAfter] },
      recallTags: ["death"],
      source: "death",
      promoteToLore: false,
    });
  }

  // 8) phase-1 consistency flags -> hook aligned to world engine player_private_hooks
  const flags: string[] = Array.isArray(resolved?.ui_hints?.consistency_flags) ? resolved.ui_hints.consistency_flags : [];
  if (flags.includes("acquire_without_awards_downgraded")) {
    push(out, {
      kind: "hook",
      scope: "run_private",
      summary: "本回合“获得”语义已被系统降级，需后续核验实际归属。",
      salience: 0.62,
      confidence: 0.95,
      status: "active",
      ttlHours: 12,
      mergeKey: "hook:consistency:acquire_downgraded",
      anchors: { locationIds: [locAfter], floorIds: [floorAfter] },
      recallTags: ["hook_consistency"],
      source: "system_hook",
      promoteToLore: false,
    });
  }

  // 9) ultra-light narrative micro patterns (opt-in, low confidence)
  if (input.enableNarrativeMicroPatterns) {
    const narrative = asString(resolved?.narrative);
    if (narrative) {
      if (/我答应你|我会答应|我保证/.test(narrative)) {
        push(out, {
          kind: "promise",
          scope: "run_private",
          summary: "你在对话中做出了承诺。",
          salience: 0.58,
          confidence: 0.58,
          status: "active",
          ttlHours: 48,
          mergeKey: `promise:generic:${floorAfter}`,
          anchors: { locationIds: [locAfter], floorIds: [floorAfter] },
          recallTags: ["promise"],
          source: "resolved_turn",
          promoteToLore: false,
        });
      }
      if (/我欠你一次|欠你一个人情/.test(narrative)) {
        push(out, {
          kind: "debt",
          scope: "run_private",
          summary: "你欠下了一份人情债。",
          salience: 0.6,
          confidence: 0.56,
          status: "active",
          ttlHours: 72,
          mergeKey: `debt:generic:${floorAfter}`,
          anchors: { locationIds: [locAfter], floorIds: [floorAfter] },
          recallTags: ["debt"],
          source: "resolved_turn",
          promoteToLore: false,
        });
      }
    }
  }

  // 总体再做一次“回合内去重”避免同义垃圾
  const dedup = new Map<string, MemoryCandidateDraft>();
  for (const c of out) {
    if (!c.mergeKey) continue;
    if (!dedup.has(c.mergeKey)) dedup.set(c.mergeKey, c);
  }
  const compact = [...dedup.values()];
  // 低价值条目限流（salience+confidence 低的靠后截断）
  compact.sort((a, b) => (b.salience * b.confidence) - (a.salience * a.confidence));
  return compact.slice(0, 14);
}


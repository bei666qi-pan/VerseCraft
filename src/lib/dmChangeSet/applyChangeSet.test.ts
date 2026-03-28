import test from "node:test";
import assert from "node:assert/strict";
import { applyDmChangeSetToDmRecord, isObjectivePlayerPerceived } from "@/lib/dmChangeSet/applyChangeSet";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { mergeCluesWithDedupe, normalizeClueUpdateArray } from "@/lib/domain/clueMerge";

const baseClient: ClientStructuredContextV1 = {
  v: 1,
  turnIndex: 1,
  playerLocation: "B1_SafeZone",
  originium: 10,
  inventoryItemIds: [],
  warehouseItemIds: [],
  equippedWeapon: null,
  weaponBag: [],
  currentProfession: null,
  worldFlags: [],
};

test("isObjectivePlayerPerceived: title substring in narrative", () => {
  assert.equal(
    isObjectivePlayerPerceived(
      { id: "x1", title: "修理配电箱", surfaced_in_narrative: false },
      "你去修理配电箱的路上很安静。"
    ),
    true
  );
});

test("applyDmChangeSetToDmRecord: promotes objective when perceived", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "对方请你帮忙：护送邮件到一楼。",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      version: 1,
      objective_candidates: [
        {
          id: "floor_mail_escort",
          title: "护送邮件",
          desc: "把邮件送到一楼信箱区",
          goal_kind: "commission",
          surfaced_in_narrative: true,
        },
      ],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  assert.equal(Array.isArray(out.new_tasks), true);
  assert.ok((out.new_tasks as unknown[]).length >= 1);
  const meta = out.security_meta as Record<string, unknown>;
  assert.equal(meta.change_set_applied, true);
});

test("applyDmChangeSetToDmRecord: demotes unseen objective to clue", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "今天天气不错。",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      version: 1,
      objective_candidates: [
        {
          id: "secret_obj",
          title: "地下密室调查",
          desc: "不应升格",
          surfaced_in_narrative: false,
        },
      ],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  const tasks = out.new_tasks as unknown[];
  assert.equal(tasks.length, 0);
  const clues = out.clue_updates as Array<{ title?: string; relatedObjectiveId?: string | null }>;
  assert.ok(Array.isArray(clues));
  assert.ok(clues.some((c) => String(c.title ?? "").includes("未露出目标候选")));
  const meta = out.security_meta as Record<string, unknown>;
  const trace = meta.change_set_trace as string[];
  assert.ok(trace.some((t) => t.startsWith("objective_skip_unseen:")));
});

test("applyDmChangeSetToDmRecord: npc_promises promotes promise goalKind", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "我答应替你保守这个秘密，绝不外泄。",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      version: 1,
      npc_promises: [
        {
          id: "promise_keep_silence",
          title: "保守秘密",
          desc: "不向第三人透露",
          goal_kind: "promise",
          surfaced_in_narrative: true,
          issuer_id: "N-010",
          issuer_name: "欣蓝",
        },
      ],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  const tasks = out.new_tasks as Array<{ id?: string; goalKind?: string }>;
  assert.ok(tasks.length >= 1);
  const p = tasks.find((t) => t.id === "promise_keep_silence");
  assert.ok(p);
  assert.equal(p!.goalKind, "promise");
});

test("applyDmChangeSetToDmRecord: dedupes objective id across buckets", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "同一委托：送信到一楼。",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      version: 1,
      objective_candidates: [
        { id: "dup_mission", title: "送信", surfaced_in_narrative: true },
      ],
      commissions: [{ id: "dup_mission", title: "送信副本", surfaced_in_narrative: true }],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  const tasks = out.new_tasks as Array<{ id?: string }>;
  const dups = tasks.filter((t) => t.id === "dup_mission");
  assert.equal(dups.length, 1);
});

test("applyDmChangeSetToDmRecord: rejects duplicate key item already held", () => {
  const client: ClientStructuredContextV1 = {
    ...baseClient,
    inventoryItemIds: ["I-A01"],
  };
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测试",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      obtained_items: [{ item_id: "I-A01", is_key_item: true }],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: client });
  assert.deepEqual(out.awarded_items, []);
  const meta = out.security_meta as Record<string, unknown>;
  const trace = meta.change_set_trace as string[];
  assert.ok(trace.some((t) => t.includes("obtained_reject:I-A01:duplicate_key_item")));
});

test("applyDmChangeSetToDmRecord: awards registry item from obtained_items", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "你得到了一件杂物。",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      obtained_items: [{ item_id: "I-C12", tier_hint: "C" }],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  const awarded = out.awarded_items as string[];
  assert.ok(awarded.includes("I-C12"));
});

test("applyDmChangeSetToDmRecord: discovered_clues flow merges into journal shape", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "x",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      discovered_clues: [
        { title: "墙上有字", detail: "别回头", kind: "trace", matures_to_objective_id: "main_wall" },
      ],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  const now = new Date().toISOString();
  const rows = normalizeClueUpdateArray(out.clue_updates, now);
  const journal = mergeCluesWithDedupe([], rows, 200);
  assert.equal(journal.length, 1);
  assert.equal(journal[0]!.maturesToObjectiveId, "main_wall");
});

test("applyDmChangeSetToDmRecord: rejects S-tier unknown item id", () => {
  const dm: Record<string, unknown> = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测试",
    is_death: false,
    consumes_time: true,
    consumed_items: [],
    awarded_items: [],
    codex_updates: [],
    relationship_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    options: [],
    currency_change: 0,
    dm_change_set: {
      obtained_items: [{ item_id: "FAKE-S", tier_hint: "S" }],
    },
  };
  const out = applyDmChangeSetToDmRecord(dm, { clientState: baseClient });
  assert.deepEqual(out.awarded_items, []);
});

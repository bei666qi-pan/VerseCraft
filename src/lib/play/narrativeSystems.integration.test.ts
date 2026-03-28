/**
 * 阶段 7：叙事系统链路的集成级回归（无浏览器、无 Zustand；串联变更集 → 手记 → 目标 → 物证线索 → 任务更新 → 完整性修复）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { applyDmChangeSetToDmRecord } from "@/lib/dmChangeSet/applyChangeSet";
import { mergeCluesWithDedupe, normalizeClueDraft, normalizeClueUpdateArray } from "@/lib/domain/clueMerge";
import { repairNarrativeCrossRefs } from "@/lib/domain/narrativeIntegrity";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import type { GameTaskV2 } from "@/lib/tasks/taskV2";
import { normalizeTaskUpdateDraft } from "@/lib/tasks/taskV2";

const client = (): ClientStructuredContextV1 => ({
  v: 1,
  turnIndex: 2,
  playerLocation: "B1_SafeZone",
  originium: 5,
  inventoryItemIds: [],
  warehouseItemIds: [],
  equippedWeapon: null,
  weaponBag: [],
  currentProfession: null,
  worldFlags: [],
});

function emptyDm(narrative: string): Record<string, unknown> {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative,
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
  };
}

test("integration: clue from change set → journal merge → key item linked clue → save repair stable", () => {
  const now = "2026-03-28T12:00:00.000Z";
  const dm1 = { ...emptyDm("你在墙角看到一行褪色的字。"), dm_change_set: { version: 1 as const, discovered_clues: [{ title: "褪色字迹", detail: "指向西侧", kind: "trace" }] } };
  const out1 = applyDmChangeSetToDmRecord(dm1, { clientState: client() });
  let journal = mergeCluesWithDedupe([], normalizeClueUpdateArray(out1.clue_updates, now), 200);
  assert.equal(journal.length, 1);

  const dm2 = {
    ...emptyDm("队长把一把旧钥匙塞给你：带去一楼信箱区。"),
    dm_change_set: {
      version: 1 as const,
      obtained_items: [{ item_id: "I-C12", tier_hint: "C" as const, is_key_item: true }],
    },
  };
  const out2 = applyDmChangeSetToDmRecord(dm2, { clientState: client() });
  const awarded = (out2.awarded_items as string[]).filter((x) => typeof x === "string");
  assert.ok(awarded.includes("I-C12"));

  const inv = new Set(awarded);
  const keyClue = normalizeClueDraft(
    {
      title: "获得物证",
      detail: "旧钥匙可能对应信箱",
      kind: "trace",
      relatedItemIds: ["I-C12"],
    },
    now
  );
  assert.ok(keyClue);
  journal = mergeCluesWithDedupe(journal, [keyClue!], 200);
  const withItem = journal.find((c) => c.relatedItemIds.includes("I-C12"));
  assert.ok(withItem);

  const dm3 = {
    ...emptyDm("我答应替你守住信箱的秘密。"),
    dm_change_set: {
      version: 1 as const,
      npc_promises: [
        {
          id: "promise_mailbox",
          title: "守住信箱秘密",
          goal_kind: "promise" as const,
          surfaced_in_narrative: true,
          issuer_id: "N-001",
          issuer_name: "队长",
          required_item_ids: ["I-C12"],
        },
      ],
    },
  };
  const out3 = applyDmChangeSetToDmRecord(dm3, { clientState: { ...client(), inventoryItemIds: ["I-C12"] } });
  const tasks = (out3.new_tasks as GameTaskV2[]).filter(Boolean);
  const prom = tasks.find((t) => t.id === "promise_mailbox");
  assert.ok(prom);
  assert.equal(prom!.goalKind, "promise");
  assert.ok((prom!.requiredItemIds ?? []).includes("I-C12"));

  const patch = normalizeTaskUpdateDraft({ id: "promise_mailbox", status: "completed" });
  assert.ok(patch);
  const mergedTasks = tasks.map((t) => (t.id === patch!.id ? { ...t, ...patch } : t));
  assert.equal(mergedTasks.find((t) => t.id === "promise_mailbox")?.status, "completed");

  const repaired = repairNarrativeCrossRefs({
    tasks: mergedTasks,
    clues: journal,
    inventoryItemIds: [...inv],
    warehouseItemIds: [],
  });
  assert.equal(repaired.tasks.find((t) => t.id === "promise_mailbox")?.status, "completed");
  assert.ok(repaired.clues.length >= 1);
});

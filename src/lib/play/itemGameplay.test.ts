import test from "node:test";
import assert from "node:assert/strict";
import type { ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";
import {
  applyItemGameplayOptionInjection,
  buildItemUseStructuredIntent,
  inferItemDomainLayer,
  shouldSkipItemOptionInjection,
} from "./itemGameplay";
import type { Item } from "@/lib/registry/types";

function baseResolved(partial: Partial<ResolvedDmTurn>): ResolvedDmTurn {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "x",
    is_death: false,
    consumes_time: true,
    options: [],
    currency_change: 0,
    consumed_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    ...partial,
  };
}

test("inferItemDomainLayer respects explicit domainLayer", () => {
  const item = { domainLayer: "evidence" } as Item;
  assert.equal(inferItemDomainLayer(item), "evidence");
});

test("inferItemDomainLayer maps intel to evidence", () => {
  const item = { effectType: "intel", tags: "" } as Item;
  assert.equal(inferItemDomainLayer(item), "evidence");
});

test("inferItemDomainLayer maps key effectType", () => {
  const item = { effectType: "key", tags: "" } as Item;
  assert.equal(inferItemDomainLayer(item), "key");
});

test("buildItemUseStructuredIntent includes id and structured hints", () => {
  const item = {
    id: "I-B01",
    name: "沾染腥味的狗绳",
    effectType: "bait",
    tags: "",
  } as Item;
  const t = buildItemUseStructuredIntent(item);
  assert.match(t, /I-B01/);
  assert.match(t, /沾染腥味的狗绳/);
  assert.match(t, /clue_updates/);
});

test("buildItemUseStructuredIntent for evidence layer asks for 质证-style resolution", () => {
  const item = { id: "I-E01", name: "照片残片", effectType: "intel", tags: "" } as Item;
  const t = buildItemUseStructuredIntent(item);
  assert.match(t, /质证|印证|反驳/);
  assert.match(t, /证据/);
});

test("applyItemGameplayOptionInjection adds evidence option when NPC + intel item", () => {
  const resolved = baseResolved({ options: ["观察环境", "离开"] });
  const next = applyItemGameplayOptionInjection(resolved, {
    inventoryItemIds: ["I-B08"],
    presentNpcIds: ["N-001"],
    stats: { sanity: 50 },
  });
  assert.ok(next.options.length >= 3);
  assert.ok(next.options.some((o) => o.includes("【证】")));
});

test("applyItemGameplayOptionInjection skips consumable hint when sanity high", () => {
  const resolved = baseResolved({ options: ["A"] });
  const next = applyItemGameplayOptionInjection(resolved, {
    inventoryItemIds: ["I-D01"],
    presentNpcIds: [],
    stats: { sanity: 80 },
  });
  assert.equal(next.options.some((o) => o.includes("【衡】")), false);
});

test("applyItemGameplayOptionInjection adds consumable hint when sanity low", () => {
  const resolved = baseResolved({ options: ["A"] });
  const next = applyItemGameplayOptionInjection(resolved, {
    inventoryItemIds: ["I-D01"],
    presentNpcIds: [],
    stats: { sanity: 30 },
  });
  assert.equal(next.options.some((o) => o.includes("【衡】")), true);
});

test("applyItemGameplayOptionInjection respects maxOptions=4", () => {
  const resolved = baseResolved({
    options: ["一", "二", "三", "四"],
  });
  const next = applyItemGameplayOptionInjection(resolved, {
    inventoryItemIds: ["I-A03", "I-B01"],
    presentNpcIds: ["N-1"],
    stats: { sanity: 20 },
  });
  assert.equal(next.options.length, 4);
});

test("shouldSkipItemOptionInjection skips death and options_regen_only", () => {
  assert.equal(
    shouldSkipItemOptionInjection({
      resolved: baseResolved({ is_death: true, options: [] }),
      clientPurpose: "normal",
    }),
    true
  );
  assert.equal(
    shouldSkipItemOptionInjection({
      resolved: baseResolved({ options: [] }),
      clientPurpose: "options_regen_only",
    }),
    true
  );
});

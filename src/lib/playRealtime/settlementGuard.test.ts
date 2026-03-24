import assert from "node:assert/strict";
import test from "node:test";
import { applyStage2SettlementGuard } from "./settlementGuard";

test("settlement guard freezes mutating fields on illegal action", () => {
  const out = applyStage2SettlementGuard({
    is_action_legal: false,
    is_death: false,
    consumed_items: ["I-C03"],
    awarded_items: ["I-B03"],
    currency_change: 9,
    main_threat_updates: [{ floorId: "2", threatId: "A-002" }],
    weapon_updates: [{ weaponId: "WPN-001", stability: 80 }],
  });
  assert.deepEqual(out.consumed_items, []);
  assert.deepEqual(out.awarded_items, []);
  assert.equal(out.currency_change, 0);
  assert.deepEqual(out.main_threat_updates, []);
  assert.deepEqual(out.weapon_updates, []);
});

test("settlement guard consumes-before-awards when same id appears", () => {
  const out = applyStage2SettlementGuard({
    is_action_legal: true,
    is_death: false,
    consumed_items: ["I-C03"],
    awarded_items: ["I-C03", "I-B03", { id: "I-C03", name: "dup" }, { id: "I-A01" }],
  });
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.equal(awarded.length, 2);
  assert.ok(awarded.some((x) => x === "I-B03"));
  assert.ok(awarded.some((x) => typeof x === "object" && x !== null && (x as { id?: string }).id === "I-A01"));
});


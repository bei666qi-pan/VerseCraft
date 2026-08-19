import test from "node:test";
import assert from "node:assert/strict";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { createInitialXingniState } from "./progression";
import { applyQingshiTurnGuard } from "./qingshiTurnGuard";

function client(overrides: Partial<ClientStructuredContextV1> = {}): ClientStructuredContextV1 {
  return {
    v: 1,
    worldId: "xingni_taichu",
    mapId: "xingni_qingshi_county",
    turnIndex: 0,
    playerLocation: "QS_GUOYAN_INN",
    originium: 0,
    inventoryItemIds: [],
    warehouseItemIds: [],
    equippedWeapon: null,
    weaponBag: [],
    currentProfession: null,
    worldFlags: [],
    worldStateDigest: createInitialXingniState(),
    ...overrides,
  };
}

test("Qingshi movement allows one registered edge and rejects multi-edge travel", () => {
  const legal = applyQingshiTurnGuard({ dmRecord: { player_location: "QS_CULTIVATOR_MARKET" }, clientState: client() });
  assert.equal(legal.player_location, "QS_CULTIVATOR_MARKET");
  const illegal = applyQingshiTurnGuard({ dmRecord: { player_location: "QS_SPIRIT_SPRING_CAVE" }, clientState: client() });
  assert.equal(illegal.is_action_legal, false);
  assert.equal(illegal.player_location, undefined);
});

test("Qingshi world delta rechecks inventory instead of trusting materialIds", () => {
  const result = applyQingshiTurnGuard({
    clientState: client({ playerLocation: "QS_HERB_HALL", inventoryItemIds: [] }),
    dmRecord: { is_action_legal: true, world_delta: { action: { type: "alchemy", recipeId: "pill_qi_gathering", materialIds: ["xq_herb_spirit_leaf", "xq_herb_sun_seed"] } } },
  });
  assert.equal((result.world_delta as { accepted: boolean }).accepted, false);
  assert.deepEqual(result.awarded_items, []);
});

test("Qingshi guard strips cross-world mechanics and unknown NPC updates", () => {
  const result = applyQingshiTurnGuard({
    clientState: client(),
    dmRecord: { currency_change: 999, weapon_updates: [{ weaponId: "WPN-001" }], relationship_updates: [{ npcId: "N-001" }, { npcId: "XQ-N005" }] },
  });
  assert.equal(result.currency_change, 0);
  assert.deepEqual(result.weapon_updates, []);
  assert.deepEqual(result.relationship_updates, [{ npcId: "XQ-N005" }]);
});

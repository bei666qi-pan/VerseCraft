import test from "node:test";
import assert from "node:assert/strict";
import { applyEquipmentNarrativeConsistencyGuard } from "./equipmentNarrativeConsistencyGuard";

test("corrects prose that denies an equipped weapon", () => {
  const out = applyEquipmentNarrativeConsistencyGuard({
    dmRecord: { narrative: "没认证、没武器、没下一步指引。" },
    clientState: { equippedWeapon: { id: "WPN-3F-IRON-PIPE" }, weaponBag: [] },
  });
  assert.equal(out.narrative, "没认证、武器仍在手中、没下一步指引。");
  assert.ok((out._commit_flags as string[]).includes("weapon_absence_prose_corrected_v1"));
});

test("distinguishes a bag weapon from an empty inventory", () => {
  const withBag = applyEquipmentNarrativeConsistencyGuard({
    dmRecord: { narrative: "我没有武器。" },
    clientState: { equippedWeapon: null, weaponBag: [{ id: "WPN-1" }] },
  });
  assert.match(String(withBag.narrative), /尚未装备.*武器袋/);
  const empty = { narrative: "我没有武器。" };
  assert.deepEqual(applyEquipmentNarrativeConsistencyGuard({ dmRecord: empty, clientState: { equippedWeapon: null, weaponBag: [] } }), empty);
});

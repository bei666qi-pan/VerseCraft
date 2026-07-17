import test from "node:test";
import assert from "node:assert/strict";
import { applyWorldWeaponPickupGuard } from "./worldWeaponAffordances";

test("registered 3F iron pipe pickup adds a finite bag weapon once", () => {
  const out = applyWorldWeaponPickupGuard({ dmRecord: {}, latestUserInput: "捡起消防栓旁的铁管", clientState: { playerLocation: "3F_304" } });
  assert.equal((out.weapon_bag_updates as Array<{ addWeapon: { id: string } }>)[0]!.addWeapon.id, "WPN-3F-IRON-PIPE");
  const again = applyWorldWeaponPickupGuard({ dmRecord: {}, latestUserInput: "捡起铁管", clientState: { playerLocation: "3F_304", worldFlags: ["pickup:WPN-3F-IRON-PIPE"] } });
  assert.equal(again.weapon_bag_updates, undefined);
});

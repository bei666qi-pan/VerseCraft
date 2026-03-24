import assert from "node:assert/strict";
import test from "node:test";
import { tickInfusions } from "./weaponInfusion";

test("tickInfusions decrements turns and drops expired infusions", () => {
  const out = tickInfusions([
    { threatTag: "mirror", turnsLeft: 3 },
    { threatTag: "seal", turnsLeft: 1 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.threatTag, "mirror");
  assert.equal(out[0]?.turnsLeft, 2);
});


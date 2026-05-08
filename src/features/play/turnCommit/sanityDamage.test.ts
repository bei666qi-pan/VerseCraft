import test from "node:test";
import assert from "node:assert/strict";
import { applyTurnSanityDamage, normalizeTurnSanityDamage } from "./sanityDamage";

test("turn sanity damage deducts精神 and triggers hit effect", () => {
  const damage = normalizeTurnSanityDamage({ rawDamage: 3 });
  const applied = applyTurnSanityDamage({ currentSanity: 10, damage });

  assert.equal(damage, 3);
  assert.equal(applied.nextSanity, 7);
  assert.equal(applied.triggerHitEffect, true);
});

test("opening round and mitigated zero damage do not trigger hit effect", () => {
  assert.equal(normalizeTurnSanityDamage({ rawDamage: 8, isOpeningSystemRequest: true }), 0);
  const damage = normalizeTurnSanityDamage({ rawDamage: 1, passiveMitigation: true });
  const applied = applyTurnSanityDamage({ currentSanity: 10, damage });

  assert.equal(damage, 0);
  assert.equal(applied.nextSanity, 10);
  assert.equal(applied.triggerHitEffect, false);
});

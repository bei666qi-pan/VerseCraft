import test from "node:test";
import assert from "node:assert/strict";
import { NPC_COMBAT_STYLE_REGISTRY_V1, NPC_COMBAT_STYLE_TEMPLATES_V1, getCombatStyleFromRegistry } from "./npcCombatStyles";

test("npcCombatStyles: major styles are present and distinct", () => {
  const majors = ["major:N-015", "major:N-010", "major:N-018", "major:N-013", "major:N-007", "major:N-020"];
  for (const k of majors) {
    const def = getCombatStyleFromRegistry(k);
    assert.ok(def, `missing style ${k}`);
    assert.ok(def!.signatureBeats.length >= 1);
    assert.ok(def!.forbiddenExaggerations.length >= 2);
  }
  const labels = majors.map((k) => NPC_COMBAT_STYLE_REGISTRY_V1[k]!.label);
  assert.equal(new Set(labels).size, labels.length);
});

test("npcCombatStyles: templates exist", () => {
  assert.ok(getCombatStyleFromRegistry("tpl:service_staff"));
  assert.ok(getCombatStyleFromRegistry("tpl:dangerous_resident"));
  assert.ok(getCombatStyleFromRegistry("tpl:information_broker"));
  assert.ok(Object.keys(NPC_COMBAT_STYLE_TEMPLATES_V1).length >= 3);
});


import test from "node:test";
import assert from "node:assert/strict";
import { NPC_COMBAT_STYLE_REGISTRY_V1, NPC_COMBAT_STYLE_TEMPLATES_V1, getCombatStyleFromRegistry } from "./npcCombatStyles";

test("npcCombatStyles: major styles are present and distinct", () => {
  const majors = ["major:N-015", "major:N-010", "major:N-018", "major:N-013", "major:N-007", "major:N-020"];
  for (const k of majors) {
    const def = getCombatStyleFromRegistry(k);
    assert.ok(def, `missing style ${k}`);
    assert.ok(typeof def!.label === "string" && def!.label.length > 0, `empty label for ${k}`);
    assert.ok(Array.isArray(def!.signatureBeats) && def!.signatureBeats.length >= 1, `missing signatureBeats for ${k}`);
    for (const s of def!.signatureBeats) {
      assert.ok(typeof s === "string" && s.trim().length > 0, `empty signatureBeat in ${k}`);
    }
    assert.ok(Array.isArray(def!.forbiddenExaggerations) && def!.forbiddenExaggerations.length >= 2, `missing forbiddenExaggerations for ${k}`);
    for (const f of def!.forbiddenExaggerations) {
      assert.ok(typeof f === "string" && f.trim().length > 0, `empty forbiddenExaggeration in ${k}`);
    }
  }
  const labels = majors.map((k) => NPC_COMBAT_STYLE_REGISTRY_V1[k]!.label);
  assert.equal(new Set(labels).size, labels.length);
});

// Stage-4：为“武器 counterTags 命中即为用对武器”提供数据来源；此前风格定义完全没有这个字段。
test("npcCombatStyles: major styles declare vulnerableToTags for the weapon counter matrix", () => {
  const majors = ["major:N-015", "major:N-010", "major:N-018", "major:N-013", "major:N-007", "major:N-020"];
  for (const k of majors) {
    const def = getCombatStyleFromRegistry(k);
    assert.ok(Array.isArray(def!.vulnerableToTags) && def!.vulnerableToTags!.length >= 1, `missing vulnerableToTags for ${k}`);
    for (const tag of def!.vulnerableToTags!) {
      assert.ok(typeof tag === "string" && tag.trim().length > 0, `empty vulnerableToTag in ${k}`);
    }
  }
});

const TEMPLATE_KEYS = ["tpl:service_staff", "tpl:dangerous_resident", "tpl:information_broker"];

test("npcCombatStyles: templates exist", () => {
  for (const k of TEMPLATE_KEYS) {
    const def = getCombatStyleFromRegistry(k);
    assert.ok(def, `missing template ${k}`);
    assert.ok(typeof def!.label === "string" && def!.label.length > 0, `empty label for ${k}`);
    assert.ok(Array.isArray(def!.signatureBeats) && def!.signatureBeats.length >= 1, `missing signatureBeats for ${k}`);
    for (const s of def!.signatureBeats) {
      assert.ok(typeof s === "string" && s.trim().length > 0, `empty signatureBeat in ${k}`);
    }
    assert.ok(Array.isArray(def!.forbiddenExaggerations) && def!.forbiddenExaggerations.length >= 1, `missing forbiddenExaggerations for ${k}`);
    for (const f of def!.forbiddenExaggerations) {
      assert.ok(typeof f === "string" && f.trim().length > 0, `empty forbiddenExaggeration in ${k}`);
    }
    const validRangeBias = ["contact", "near", "mixed"] as const;
    assert.ok(validRangeBias.includes(def!.rangeBias), `invalid rangeBias for ${k}: ${def!.rangeBias}`);
    const validDestruction = ["none", "minor", "room", "corridor"] as const;
    assert.ok(validDestruction.includes(def!.destructionScale), `invalid destructionScale for ${k}: ${def!.destructionScale}`);
    const validFinish = ["subdue", "trade_exit", "break_morale", "kill_if_rule"] as const;
    assert.ok(validFinish.includes(def!.finishTendency), `invalid finishTendency for ${k}: ${def!.finishTendency}`);
  }
  const templateKeys = Object.keys(NPC_COMBAT_STYLE_TEMPLATES_V1);
  for (const k of TEMPLATE_KEYS) {
    assert.ok(templateKeys.includes(k), `expected template key missing: ${k}`);
  }
});


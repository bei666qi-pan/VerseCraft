import assert from "node:assert/strict";
import test from "node:test";
import { localizedCodexClassification, parseLocalizedGameplayPresentation } from "./gameplayPresentation";

test("English localized presentation rejects untranslated Chinese narrative and options", () => {
  const result = parseLocalizedGameplayPresentation(
    JSON.stringify({ narrative: "我走向门口。", options: ["我敲门", "我后退"] }),
    "en-US",
    2
  );
  assert.deepEqual(result, { ok: false, reason: "english_contains_cjk" });
});

test("localized presentation preserves only the latest display copy fields", () => {
  const result = parseLocalizedGameplayPresentation(
    JSON.stringify({ narrative: "I listen at the door.", options: ["I knock once.", "I step back."], sanity_damage: 99 }),
    "en-US",
    2
  );
  assert.deepEqual(result, {
    ok: true,
    value: { narrative: "I listen at the door.", options: ["I knock once.", "I step back."] },
  });
  assert.equal(localizedCodexClassification("en-US", "npc"), "Person");
  assert.equal(localizedCodexClassification("zh-CN", "npc"), "人物");
});

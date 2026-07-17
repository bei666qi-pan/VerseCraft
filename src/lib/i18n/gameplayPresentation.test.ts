import assert from "node:assert/strict";
import test from "node:test";
import {
  localizedCodexClassification,
  hasWrongGameplayTurnLanguage,
  parseLocalizedGameplayPresentation,
  parseLocalizedStoryEntries,
} from "./gameplayPresentation";

test("English localized presentation rejects untranslated Chinese narrative and options", () => {
  const result = parseLocalizedGameplayPresentation(
    JSON.stringify({ narrative: "我走向门口。", options: ["我敲门", "我后退"] }),
    "en-US",
    2
  );
  assert.deepEqual(result, { ok: false, reason: "english_contains_cjk" });
});

test("English turn language guard catches Chinese prose in either narrative or choices", () => {
  assert.equal(hasWrongGameplayTurnLanguage({ narrative: "I listen.", options: ["我后退"] }, "en-US"), true);
  assert.equal(hasWrongGameplayTurnLanguage({ narrative: "I listen.", decision_options: ["I wait."] }, "en-US"), false);
});

test("history localization rejects a mixed-language entry instead of committing a partial switch", () => {
  const result = parseLocalizedStoryEntries(
    JSON.stringify({ entries: [{ index: 0, content: "The corridor is quiet." }, { index: 2, content: "门后有人。" }] }),
    "en-US",
    [{ index: 0, content: "走廊很安静。" }, { index: 2, content: "门后有人。" }]
  );
  assert.deepEqual(result, { ok: false, reason: "english_contains_cjk" });
});

test("history localization preserves every timeline index exactly once", () => {
  const result = parseLocalizedStoryEntries(
    JSON.stringify({ entries: [{ index: 3, content: "I wait by the door." }, { index: 5, content: "The voice falls silent." }] }),
    "en-US",
    [{ index: 3, content: "我在门边等待。" }, { index: 5, content: "声音沉默下来。" }]
  );
  assert.deepEqual(result, {
    ok: true,
    value: [{ index: 3, content: "I wait by the door." }, { index: 5, content: "The voice falls silent." }],
  });
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

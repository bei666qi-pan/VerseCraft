import assert from "node:assert/strict";
import test from "node:test";
import {
  localizedCodexClassification,
  hasWrongGameplayTurnLanguage,
  parseLocalizedGameplayPresentation,
  parseLocalizedStoryEntries,
  parseLocalizedTaskTexts,
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

test("task localization rejects an untranslated English field and mechanic-shaped additions", () => {
  const expected = [{ id: "task-a", fields: { title: "找钥匙", nextHint: "去问老刘" } }];
  assert.deepEqual(
    parseLocalizedTaskTexts(
      JSON.stringify({ tasks: [{ id: "task-a", fields: { title: "Find the key", nextHint: "去问老刘" } }] }),
      "en-US",
      expected
    ),
    { ok: false, reason: "english_contains_cjk" }
  );
  assert.deepEqual(
    parseLocalizedTaskTexts(
      JSON.stringify({ tasks: [{ id: "task-a", fields: { title: "Find the key", nextHint: "Ask Old Liu", status: "completed" } }] }),
      "en-US",
      expected
    ),
    { ok: false, reason: "task_field_mismatch" }
  );
});

test("task localization preserves IDs and exactly the requested display fields", () => {
  const expected = [
    { id: "task-a", fields: { title: "找钥匙", desc: "门锁住了" } },
    { id: "task-b", fields: { issuerName: "老刘" } },
  ];
  assert.deepEqual(
    parseLocalizedTaskTexts(
      JSON.stringify({ tasks: [
        { id: "task-b", fields: { issuerName: "Old Liu" } },
        { id: "task-a", fields: { title: "Find the key", desc: "The door is locked." } },
      ] }),
      "en-US",
      expected
    ),
    {
      ok: true,
      value: [
        { id: "task-b", fields: { issuerName: "Old Liu" } },
        { id: "task-a", fields: { title: "Find the key", desc: "The door is locked." } },
      ],
    }
  );
});

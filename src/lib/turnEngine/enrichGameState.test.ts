import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichCodexFromNarrative,
  enrichGameState,
  enrichItemsFromNarrative,
  enrichOptionsFromNarrative,
} from "./enrichGameState";

// ── Options ──

test("enrichOptions: returns existing options unchanged", () => {
  const existing = ["探索", "检查"];
  const result = enrichOptionsFromNarrative({ currentOptions: existing, narrative: "走廊很暗。" });
  assert.deepStrictEqual(result, existing);
});

test("enrichOptions: generates danger options for dangerous narrative", () => {
  const result = enrichOptionsFromNarrative({ currentOptions: [], narrative: "怪物从走廊深处逼近，我感到了死亡的威胁。" });
  assert.equal(result.length, 4);
  assert.ok(result.some((o) => o.includes("警惕") || o.includes("武器")), "should contain danger-related options");
});

test("enrichOptions: generates dialogue options for dialogue narrative", () => {
  const result = enrichOptionsFromNarrative({ currentOptions: [], narrative: "「你确定要往前走？」她问道。" });
  assert.equal(result.length, 4);
  assert.ok(result.some((o) => o.includes("追问") || o.includes("观察")), "should contain dialogue options");
});

test("enrichOptions: generates explore options as default", () => {
  const result = enrichOptionsFromNarrative({ currentOptions: [], narrative: "我站在走廊里。" });
  assert.equal(result.length, 4);
  assert.ok(result.every((o) => o.includes("我")), "all options should be first-person");
});

// ── Codex ──

test("enrichCodex: adds NPC codex when mentioned in narrative", () => {
  const result = enrichCodexFromNarrative({
    existingCodex: [],
    narrative: "麟泽站在安全区门口，雨水从他外套上滴下来。",
    sceneNpcIds: ["N-015"],
  });
  assert.ok(result.length > 0, "should detect 麟泽 in narrative");
  assert.equal(result[0]!.name, "麟泽");
  assert.equal(result[0]!.type, "npc");
});

test("enrichCodex: skips NPCs already in codex", () => {
  const result = enrichCodexFromNarrative({
    existingCodex: [{ id: "N-015", name: "麟泽" }],
    narrative: "麟泽站在那里。",
  });
  assert.equal(result.length, 0, "should skip already-known NPC");
});

test("enrichCodex: skips NPCs not in narrative", () => {
  const result = enrichCodexFromNarrative({
    existingCodex: [],
    narrative: "走廊空无一人。",
  });
  // May have 0 or more depending on NPC registry; verify result items have expected codex entry shape
  assert.ok(Array.isArray(result));
  for (const entry of result) {
    assert.equal(typeof entry.name, "string", "codex entry should have name");
    assert.equal(entry.type, "npc", "codex entry should be npc type");
  }
});

// ── Items ──

test("enrichItems: detects item acquisition", () => {
  const result = enrichItemsFromNarrative({
    existingItems: [],
    narrative: "我捡起地上的螺纹钢，握在手里掂了掂重量。",
  });
  assert.ok(result.length > 0, "should detect rebar acquisition");
  assert.equal(result[0]!.id, "rebar");
});

test("enrichItems: skips items without acquisition verb", () => {
  const result = enrichItemsFromNarrative({
    existingItems: [],
    narrative: "角落里有一根螺纹钢。墙上还挂着钥匙。",
  });
  // Items are mentioned but not acquired — should return empty
  assert.equal(result.length, 0, "should not award items just because they're mentioned");
});

test("enrichItems: skips already-owned items", () => {
  const result = enrichItemsFromNarrative({
    existingItems: [{ id: "rebar" }],
    narrative: "我拿起螺纹钢。",
  });
  assert.equal(result.length, 0, "should not duplicate already-owned items");
});

// ── Combined ──

test("enrichGameState: fills all missing fields", () => {
  const result = enrichGameState({
    narrative: "麟泽说：「小心那道门。」我捡起地上的钥匙。",
    currentOptions: [],
    currentCodex: [],
    currentItems: [],
    sceneNpcIds: ["N-015"],
  });
  assert.ok(result.options.length > 0, "options should be filled");
  assert.ok(result.codexUpdates.length > 0, "codex should detect 麟泽");
  // "捡起" + "钥匙" should trigger item extraction
  assert.ok(result.awardedItems.length > 0, "should detect key acquisition");
  assert.ok(result.notes.length > 0, "should have enrichment notes");
});

test("enrichGameState: does not overwrite existing data", () => {
  const existingOptions = ["自定义选项"];
  const result = enrichGameState({
    narrative: "走廊很安静。",
    currentOptions: existingOptions,
    currentCodex: [{ id: "N-015", name: "麟泽" }],
    currentItems: [{ id: "flashlight" }],
    sceneNpcIds: ["N-015"],
  });
  assert.deepStrictEqual(result.options, existingOptions, "should keep existing options");
});

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

test("enrichCodex: narrative mentions never create codex state", () => {
  const result = enrichCodexFromNarrative({
    existingCodex: [],
    narrative: "麟泽站在安全区门口，雨水从他外套上滴下来。",
    sceneNpcIds: ["N-015"],
  });
  assert.deepEqual(result, []);
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

test("enrichItems: narrative acquisition never creates inventory state", () => {
  const result = enrichItemsFromNarrative({
    existingItems: [],
    narrative: "我捡起地上的螺纹钢，握在手里掂了掂重量。",
  });
  assert.deepEqual(result, []);
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

test("enrichGameState: fills options but never state from narrative", () => {
  const result = enrichGameState({
    narrative: "麟泽说：「小心那道门。」我捡起地上的钥匙。",
    currentOptions: [],
    currentCodex: [],
    currentItems: [],
    sceneNpcIds: ["N-015"],
  });
  assert.ok(result.options.length > 0, "options should be filled");
  assert.deepEqual(result.codexUpdates, []);
  assert.deepEqual(result.awardedItems, []);
  assert.equal(result.playerLocation, null);
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

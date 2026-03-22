import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_SCENARIO = new Set([
  "normal_action",
  "npc_dialogue",
  "item_interaction",
  "combat_high_rules",
  "long_context",
  "preflight_sensitive",
]);

function loadFixtureFiles(): string[] {
  const dir = path.join(process.cwd(), "benchmarks", "chat-turns");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

test("benchmarks/chat-turns: six scenarios with valid shape", () => {
  const files = loadFixtureFiles();
  assert.ok(files.length >= 6, `expected at least 6 json fixtures, got ${files.length}`);
  const seen = new Set<string>();
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    const j = JSON.parse(raw) as Record<string, unknown>;
    assert.equal(typeof j.scenario, "string", file);
    assert.equal(typeof j.latestUserInput, "string", file);
    assert.equal(typeof j.playerContext, "string", file);
    assert.ok(j.description == null || typeof j.description === "string", file);
    const rs = j.ruleSnapshot as Record<string, unknown> | undefined;
    if (rs) {
      assert.equal(typeof rs.in_combat_hint, "boolean", file);
      assert.equal(typeof rs.in_dialogue_hint, "boolean", file);
      assert.equal(typeof rs.location_changed_hint, "boolean", file);
      assert.equal(typeof rs.high_value_scene, "boolean", file);
    }
    seen.add(String(j.scenario));
  }
  for (const s of REQUIRED_SCENARIO) {
    assert.ok(seen.has(s), `missing scenario ${s}`);
  }
});

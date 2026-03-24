import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("chat route 保持 SSE 终帧与 JSON 契约关键字段", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");
  assert.ok(content.includes("__VERSECRAFT_FINAL__"));
  assert.ok(content.includes("runStreamFinalHooks"));
  const required = ["is_action_legal", "sanity_damage", "narrative", "is_death", "consumes_time"];
  for (const key of required) {
    assert.ok(content.includes(key), `missing contract key marker: ${key}`);
  }
  assert.ok(content.includes("maxChars: 2400"), "runtime packet budget changed unexpectedly");
});

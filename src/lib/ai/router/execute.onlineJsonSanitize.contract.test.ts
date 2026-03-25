import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("AI router: 在线短 JSON 任务具备轻量思考污染清洗（<think> + prose wrapper）", () => {
  const p = join(process.cwd(), "src/lib/ai/router/execute.ts");
  const content = readFileSync(p, "utf8");

  assert.ok(content.includes("sanitizeOnlineShortJsonText"), "missing sanitizeOnlineShortJsonText");
  assert.ok(content.includes("ONLINE_SHORT_JSON_TASKS"), "missing ONLINE_SHORT_JSON_TASKS gate");
  assert.ok(
    content.includes("\"PLAYER_CONTROL_PREFLIGHT\"") ||
      content.includes("'PLAYER_CONTROL_PREFLIGHT'"),
    "PLAYER_CONTROL_PREFLIGHT must be in online short JSON task set"
  );
  assert.ok(content.includes("stripThinkBlocks"), "must strip <think> blocks");
  assert.ok(content.includes("extractFirstJsonObject"), "must extract first JSON object from prose");
});


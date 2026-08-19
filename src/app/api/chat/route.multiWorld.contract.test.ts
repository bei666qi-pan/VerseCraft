import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");

test("xingni keeps the shared SSE final contract and scopes keys_missing", () => {
  assert.match(route, /X-VerseCraft-Ai-Status": "keys_missing"/);
  assert.match(route, /worldId: "xingni_taichu"/);
  assert.match(route, /mapId: clientState\?\.mapId \?\? "xingni_qingshi_county"/);
  assert.match(route, /VERSECRAFT_FINAL_PREFIX/);
});

test("xingni preserves authoritative world_delta across output audit", () => {
  assert.match(route, /const authoritativeWorldDelta = isXingniTurn \? dmObj\.world_delta : undefined/);
  assert.match(route, /dmRecord\.world_delta = authoritativeWorldDelta/);
  assert.match(route, /applyQingshiTurnGuard\(\{ dmRecord, clientState \}\)/);
});

test("xingni keeps DM agent facts isolated while enabling capability-gated soft director", () => {
  assert.match(route, /if \(!isXingniTurn && _dmAgentRollout\.enableDmAgent/);
  assert.match(route, /authority: isXingniTurn \? "capability_gated_soft"/);
  assert.match(route, /const backgroundWorldId = isXingniTurn \? XINGNI_WORLD_ID : DARK_MOON_WORLD_ID/);
  assert.match(route, /const backgroundMapId = isXingniTurn \? QINGSHI_MAP_ID : DARK_MOON_MAP_ID/);
  assert.doesNotMatch(route, /if \(!isXingniTurn && dmRecord && sessionId && worldDirectorConfig\.enabled\)/);
});

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

test("DM Agent path no longer hard-excludes Xingni (worldId-aware classifier)", () => {
  // 2026-08: DM Agent gate 必须对暗月 + 星逆双生效
  assert.doesNotMatch(
    route,
    /if \(!isXingniTurn && _dmAgentRollout\.enableDmAgent/,
    "DM Agent gate must not exclude Xingni turns anymore"
  );
  assert.match(
    route,
    /_dmAgentRollout\.enableDmAgent && shouldAttemptDmAgentForWorld\(latestUserInput, clientState\?\.worldId\)/,
    "DM Agent gate must now use the per-world classifier (no !isXingniTurn short-circuit)"
  );
  assert.match(route, /authority: isXingniTurn \? "capability_gated_soft"/);
  assert.match(route, /const backgroundWorldId = isXingniTurn \? XINGNI_WORLD_ID : DARK_MOON_WORLD_ID/);
  assert.match(route, /const backgroundMapId = isXingniTurn \? QINGSHI_MAP_ID : DARK_MOON_MAP_ID/);
  assert.doesNotMatch(route, /if \(!isXingniTurn && dmRecord && sessionId && worldDirectorConfig\.enabled\)/);
});

test("DM Agent _dmInput no longer hardcodes dark_moon / 1F_Lobby (worldId runtime derived)", () => {
  // 历史漏洞:route.ts 2221-2225 把 worldId 写死为 "dark_moon"、playerLocation 兜底为 "1F_Lobby"
  // 修复后必须从 clientState / worldId 派生 + 各世界默认 map 兜底
  assert.doesNotMatch(
    route,
    /worldId:\s*"dark_moon"/,
    "DM Agent _dmInput.worldId must not be hardcoded to dark_moon; derive from clientState instead"
  );
  assert.doesNotMatch(
    route,
    /playerLocation:\s*\(clientState as any\)\?\.playerLocation \?\? "1F_Lobby"/,
    "DM Agent _dmInput.playerLocation must not hard-fallback to 1F_Lobby; derive from clientState / world defaults"
  );
  assert.match(
    route,
    /_dmWorldId\s*=\s*clientState\?\.worldId\s*\?\?/,
    "DM Agent _dmInput.worldId must derive from clientState.worldId with worldId-default fallback"
  );
  assert.match(
    route,
    /_dmPlayerLocation\s*=\s*clientState\?\.playerLocation\s*\?\?/,
    "DM Agent _dmInput.playerLocation must derive from clientState.playerLocation with mapId-default fallback"
  );
});

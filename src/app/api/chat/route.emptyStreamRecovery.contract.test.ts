import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("chat route EMPTY_CONTENT recovery uses count-based gating after reconnect refactor", () => {
  const routePath = path.resolve(process.cwd(), "src/app/api/chat/route.ts");
  const source = fs.readFileSync(routePath, "utf8");

  // After refactor: uses simple `streamEmptyCount` counter instead of the
  // per-role `streamEmptyRecoveryRoles` Set.  One empty-content reconnect
  // is allowed per turn; subsequent empties are declined.
  assert.match(source, /let streamEmptyCount = 0;/);
  assert.match(source, /kind === "EMPTY_CONTENT" && streamEmptyCount >= 1/);
  assert.match(source, /if \(kind === "EMPTY_CONTENT"\) streamEmptyCount \+= 1;/);
  assert.match(source, /const scheduleStreamReconnect = async/);
  // Ensure the old per-role Set-based approach is not present.
  assert.doesNotMatch(source, /streamEmptyRecoveryRoles/);
});

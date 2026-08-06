import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("daily rebuild preserves legacy activity sources and separately rebuilds Beijing web traffic", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/analytics/aggregation.ts"), "utf8");
  assert.match(source, /actorDailyActivity/);
  assert.match(source, /actorDailyTokens/);
  assert.match(source, /eventName} = 'user_registered'/);
  assert.match(source, /await rebuildWebTrafficDailyForDateKey\(getBeijingDateKey\(parseUtcDateKeyToDate\(dateKey\)\)\)/);
  assert.match(source, /event_time >= \$\{start\} AND event_time <= \$\{end\}/);
  assert.match(source, /ON CONFLICT \(date_key\) DO UPDATE SET/);
});

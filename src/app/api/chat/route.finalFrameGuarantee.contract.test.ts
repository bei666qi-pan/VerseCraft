import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("chat route falls back instead of closing a visible stream without a final frame", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");

  assert.match(route, /let finalFrameWritten = false;/);
  assert.match(
    route,
    /await writer\.write\(sse\(`\$\{VERSECRAFT_FINAL_PREFIX\}\$\{finalizePayload\}`\)\);\s*finalFrameWritten = true;/
  );

  for (const hookResult of ["closedByFinalHooks", "closedByFinalHooksDone"]) {
    assert.match(
      route,
      new RegExp(
        `if \\(!${hookResult}\\) \\{\\s*if \\(finalFrameWritten\\) \\{\\s*await writer\\.close\\(\\);\\s*\\} else \\{\\s*await closeWithFallback\\(\\);\\s*\\}\\s*\\}`
      ),
      `${hookResult} must not close the SSE response unless a final frame was written`
    );
  }
});

test("chat route background failures use the final-frame fallback helper", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const backgroundCatch = route.slice(
    route.indexOf("})().catch(async (error) =>"),
    route.indexOf("}).finally(() =>")
  );

  assert.match(backgroundCatch, /await closeWithFallback\(\);/);
  assert.doesNotMatch(backgroundCatch, /writer\.write\(sse\(fallbackPayload\)\)/);
});

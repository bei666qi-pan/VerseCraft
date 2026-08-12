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

test("normal final hooks leave the stream loop responsible for closing the writer", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const finalWrite = route.indexOf(
    "await writer.write(sse(`${VERSECRAFT_FINAL_PREFIX}${finalizePayload}`));"
  );
  const hookEnd = route.indexOf("let streamTtftTelemetrySent", finalWrite);
  const normalFinalPath = route.slice(finalWrite, hookEnd);

  assert.ok(finalWrite >= 0 && hookEnd > finalWrite, "normal final hook path must exist");
  assert.match(normalFinalPath, /finalFrameWritten = true;/);
  assert.match(normalFinalPath, /return false;/);
  assert.doesNotMatch(normalFinalPath, /return true;\s*};\s*$/);
});

test("chat route consumes the structured director-agenda load result", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");

  assert.match(route, /dueDirectorAgendaForPrompt\.items\s*\.map\(/);
  assert.match(route, /dueDirectorAgendaForPrompt\.items\.length > 0/);
  assert.doesNotMatch(route, /dueDirectorAgendaForPrompt\s*\.map\(/);
  assert.doesNotMatch(route, /dueDirectorAgendaForPrompt\.length/);
});

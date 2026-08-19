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
  assert.match(
    route,
    /if \(finalFrameWritten\) \{\s*await writer\.close\(\);\s*\}\s*return true;\s*\};/,
    "a handled normal final hook must close the SSE writer before its callers skip closeWithFallback"
  );

  for (const hookResult of ["closedByFinalHooks", "closedByFinalHooksDone"]) {
    assert.match(
      route,
      new RegExp(
        `if \\(!${hookResult}\\) \\{\\s*if \\(finalFrameWritten\\) \\{\\s*await writer\\.close\\(\\);\\s*\\} else \\{\\s*await closeWithFallback\\(.*\\);\\s*\\}\\s*\\}`
      ),
      `${hookResult} must not close the SSE response unless a final frame was written`
    );
  }
});

test("chat watchdog aborts optional hooks and leaves delivery margin before the shared client deadline", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const budget = readFileSync(
    join(process.cwd(), "src/lib/perf/chatFinalizationBudget.ts"),
    "utf8",
  );

  assert.match(route, /const turnWatchdogMs = resolveChatTurnWatchdogMs\(/);
  assert.match(route, /const streamHardCapMs = resolveChatStreamHardCapMs\(/);
  assert.match(route, /const streamAbsoluteDeadlineAt = requestStartedAt \+ streamHardCapMs;/);
  assert.match(route, /const streamRoundDeadlineAt = streamAbsoluteDeadlineAt;/);
  assert.match(
    route,
    /envNumber\("VC_CHAT_STREAM_IDLE_TIMEOUT_MS", CHAT_LATENCY_BUDGET\.normalTurnFinalP50Ms\)/,
  );
  assert.match(route, /pipelineAbort\.abort\("turn_watchdog"\);/);
  assert.match(route, /void activeStreamReader\?\.cancel\(\)\.catch/);
  const streamCatch = route.slice(
    route.indexOf("} catch (error) {", route.indexOf("stream_pass: while")),
    route.indexOf("})().catch(async (error) =>"),
  );
  assert.match(streamCatch, /void reader\.cancel\(\)\.catch/);
  assert.doesNotMatch(streamCatch, /await reader\.cancel\(\)/);
  assert.doesNotMatch(
    route.slice(route.indexOf("const turnWatchdog = setTimeout"), route.indexOf("turnWatchdog.unref")),
    /await activeStreamReader\?\.cancel\(\)/,
  );
  assert.match(route, /if \(pipelineAbort\.signal\.aborted \|\| finalFrameWritten\) return true;/);
  assert.match(budget, /normalTurnFinalP95Ms - CHAT_WATCHDOG_DELIVERY_RESERVE_MS/);
});

test("chat deadlines use the monotonic performance clock instead of wall time", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");

  assert.match(route, /const requestReceivedAt = nowMs\(\);/);
  assert.match(route, /const remainingMs = deadlineAt - nowMs\(\);/);
  assert.match(route, /if \(nowMs\(\) > streamRoundDeadlineAt\)/);
  assert.doesNotMatch(route, /Date\.now\(\) - requestStartedAt/);
});

test("live finalization keeps post-stream model repair off the critical path by default", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");

  assert.match(
    route,
    /isMockScenario \|\| envBoolean\("VERSECRAFT_ENABLE_INLINE_FINAL_MODEL_REPAIR", false\)/,
  );
  assert.match(route, /!inlineFinalModelRepairEnabled/);
  assert.match(route, /extractSafeNarrativePrefixBeforeProtocolLeak\(partialNarrative\)/);
});

test("chat route no longer consumes the legacy agenda prompt path", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  assert.doesNotMatch(route, /dueDirectorAgendaForPrompt/);
  assert.doesNotMatch(route, /markDirectorAgendaInjected/);
  assert.match(route, /directorHintIdsForReceipt/);
});

test("chat route uses the validated director digest without an undefined prompt alias", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const promptAssembly = readFileSync(
    join(process.cwd(), "src/lib/playRealtime/promptAssembly.ts"),
    "utf8",
  );

  assert.match(route, /const directorDigest = validatePacingChapterDigest\(directorDigestRaw\);/);
  assert.match(route, /const directorDigestRecordForPacing =\s*directorDigest &&/);
  assert.doesNotMatch(route, /directorDigestForPrompt/);
  assert.doesNotMatch(promptAssembly, /directorDigestForPrompt/);
});

test("chat route background failures use the final-frame fallback helper", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const backgroundCatch = route.slice(
    route.indexOf("})().catch(async (error) =>"),
    route.indexOf("}).finally(() =>")
  );

  assert.match(backgroundCatch, /await closeWithFallback\(/);
  assert.doesNotMatch(backgroundCatch, /writer\.write\(sse\(fallbackPayload\)\)/);
});

test("both chat branches write FINAL before scheduling a world tick", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const agentBranchStart = route.indexOf("// Phase 9: write FINAL");
  const agentFinal = route.indexOf("VERSECRAFT_FINAL_PREFIX", agentBranchStart);
  const agentEnqueue = route.indexOf("scheduleBackgroundWorldTick({", agentFinal);
  assert.ok(agentBranchStart >= 0 && agentFinal > agentBranchStart && agentEnqueue > agentFinal);

  const normalFinal = route.lastIndexOf('await writer.write(sse(`${VERSECRAFT_FINAL_PREFIX}${finalizePayload}`))');
  const normalEnqueue = route.indexOf("scheduleBackgroundWorldTick({", normalFinal);
  assert.ok(normalFinal >= 0 && normalEnqueue > normalFinal);
});

test("internal Director hint receipts are validated, recorded, and stripped before final", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const validator = route.indexOf("normalizeDirectorHintReceipt(rawReceipt, new Set(directorHintIdsForReceipt))");
  const telemetry = route.indexOf('eventName: "director_hint_receipt"', validator);
  const strip = route.indexOf("return stripDirectorHintReceipt(record)", telemetry);
  const normalConsume = route.indexOf("dmRecord = consumeInternalDirectorHintReceipt(dmRecord)", strip);
  const normalFinal = route.lastIndexOf('await writer.write(sse(`${VERSECRAFT_FINAL_PREFIX}${finalizePayload}`))');
  assert.ok(validator >= 0 && telemetry > validator && strip > telemetry && normalConsume > strip && normalFinal > normalConsume);
});

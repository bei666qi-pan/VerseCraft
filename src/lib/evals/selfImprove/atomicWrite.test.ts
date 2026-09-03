/**
 * Atomic persistence tests: normal write/read, interrupted write (half JSON),
 * backup fallback, schema validation, repeated cycles, directory isolation.
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import { writeFileSync, rmSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { atomicWriteJsonSync, loadJsonWithFallback } from "./atomicWrite";

const DIR = ".runtime-data/self-improve/test-atomic-write";
const FILE = `${DIR}/state.json`;

interface TestState { cycle: number; repairAttempts: { success: boolean }[] }
const isTestState = (v: unknown): v is TestState =>
  !!v && typeof (v as TestState).cycle === "number" && Array.isArray((v as TestState).repairAttempts);

describe("atomicWriteJsonSync + loadJsonWithFallback", () => {
  afterEach(() => {
    try { rmSync(resolve(process.cwd(), DIR), { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("writes and reads back a normal state", () => {
    const r = atomicWriteJsonSync(FILE, { cycle: 1, repairAttempts: [] });
    assert.equal(r.ok, true);
    const loaded = loadJsonWithFallback(FILE, isTestState);
    assert.equal(loaded.source, "main");
    assert.deepEqual(loaded.value, { cycle: 1, repairAttempts: [] });
  });

  it("leaves no tmp files behind after a successful write", () => {
    atomicWriteJsonSync(FILE, { cycle: 1, repairAttempts: [] });
    const leftovers = readdirSync(resolve(process.cwd(), DIR)).filter((f) => f.includes(".tmp-"));
    assert.deepEqual(leftovers, []);
  });

  it("recovers from a half-written (corrupted) main file via .bak", () => {
    atomicWriteJsonSync(FILE, { cycle: 1, repairAttempts: [{ success: true }] });
    atomicWriteJsonSync(FILE, { cycle: 2, repairAttempts: [{ success: true }, { success: false }] });
    // Simulate crash mid-write: truncate the main file to half JSON
    writeFileSync(resolve(process.cwd(), FILE), '{"cycle": 2, "repairAttem', "utf-8");
    const loaded = loadJsonWithFallback(FILE, isTestState);
    assert.equal(loaded.corrupted, true);
    assert.equal(loaded.source, "backup");
    assert.equal(loaded.value?.cycle, 1); // last-known-good
    assert.equal(loaded.value?.repairAttempts.length, 1);
  });

  it("rejects a syntactically valid but schema-invalid file", () => {
    atomicWriteJsonSync(FILE, { cycle: 1, repairAttempts: [] });
    atomicWriteJsonSync(FILE, { cycle: 2, repairAttempts: [] }); // creates .bak of cycle 1
    writeFileSync(resolve(process.cwd(), FILE), '{"foo":"bar"}', "utf-8");
    const loaded = loadJsonWithFallback(FILE, isTestState);
    assert.equal(loaded.corrupted, true);
    assert.equal(loaded.source, "backup");
    assert.equal(loaded.value?.cycle, 1);
  });

  it("returns none (not silent corruption) for a missing file", () => {
    const loaded = loadJsonWithFallback(`${DIR}/never-existed.json`, isTestState);
    assert.equal(loaded.source, "none");
    assert.equal(loaded.corrupted, false);
    assert.equal(loaded.value, null);
  });

  it("preserves repair success across consecutive cycle writes", () => {
    atomicWriteJsonSync(FILE, { cycle: 1, repairAttempts: [{ success: true }] });
    const s1 = loadJsonWithFallback(FILE, isTestState).value!;
    atomicWriteJsonSync(FILE, { cycle: 2, repairAttempts: [...s1.repairAttempts, { success: false }] });
    const s2 = loadJsonWithFallback(FILE, isTestState).value!;
    assert.equal(s2.cycle, 2);
    assert.deepEqual(s2.repairAttempts, [{ success: true }, { success: false }]);
  });

  it("keeps states isolated per campaign directory", () => {
    atomicWriteJsonSync(`${DIR}/campaign-a/state.json`, { cycle: 1, repairAttempts: [] });
    atomicWriteJsonSync(`${DIR}/campaign-b/state.json`, { cycle: 7, repairAttempts: [{ success: true }] });
    assert.equal(loadJsonWithFallback(`${DIR}/campaign-a/state.json`, isTestState).value?.cycle, 1);
    assert.equal(loadJsonWithFallback(`${DIR}/campaign-b/state.json`, isTestState).value?.cycle, 7);
  });
});

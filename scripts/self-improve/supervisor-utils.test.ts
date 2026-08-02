/**
 * Supervisor helper unit tests.
 *
 * Reproduces the scheduling bug where the supervisor could not extract
 * the eval runId from run.ts output because `\w` does not match the
 * hyphens in run ids like `si-20260731-045534`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRunId, diffSnapshots } from "./supervisor-utils";

describe("extractRunId", () => {
  it("extracts a hyphenated si- run id from run.ts success output", () => {
    const out = "[SelfImprove] Run si-20260731-045534 started. Profile: smoke\n[SelfImprove] Loaded 15 scenarios";
    assert.equal(extractRunId(out), "si-20260731-045534");
  });

  it("extracts the run id from failed-run output (execSync catch path)", () => {
    const out = "some error\n[SelfImprove] Run si-20260731-044816 started. Profile: smoke\nFatal error: boom";
    assert.equal(extractRunId(out), "si-20260731-044816");
  });

  it("returns null when no run id is present", () => {
    assert.equal(extractRunId("no run line here"), null);
  });
});

describe("diffSnapshots", () => {
  const snap = (entries: Record<string, { status: string; mtimeMs: number | null }>) =>
    new Map(Object.entries(entries));

  it("detects newly appeared files", () => {
    const before = snap({ "src/a.ts": { status: "M ", mtimeMs: 100 } });
    const after = snap({ "src/a.ts": { status: "M ", mtimeMs: 100 }, "src/b.ts": { status: "??", mtimeMs: 200 } });
    assert.deepEqual(diffSnapshots(before, after), ["src/b.ts"]);
  });

  it("detects content changes inside untracked directories via mtime", () => {
    // Regression: `git status --porcelain` reports an untracked directory as a
    // single `?? dir/` line, so edits to files inside it are invisible.
    const before = snap({ "src/lib/evals/selfImprove/strictVerifier.ts": { status: "??", mtimeMs: 100 } });
    const after = snap({ "src/lib/evals/selfImprove/strictVerifier.ts": { status: "??", mtimeMs: 999 } });
    assert.deepEqual(diffSnapshots(before, after), ["src/lib/evals/selfImprove/strictVerifier.ts"]);
  });

  it("returns empty when nothing changed", () => {
    const before = snap({ "src/a.ts": { status: "M ", mtimeMs: 100 } });
    const after = snap({ "src/a.ts": { status: "M ", mtimeMs: 100 } });
    assert.deepEqual(diffSnapshots(before, after), []);
  });

  it("ignores files that disappeared", () => {
    const before = snap({ "src/a.ts": { status: "M ", mtimeMs: 100 }, "src/gone.ts": { status: "??", mtimeMs: 50 } });
    const after = snap({ "src/a.ts": { status: "M ", mtimeMs: 100 } });
    assert.deepEqual(diffSnapshots(before, after), []);
  });
});

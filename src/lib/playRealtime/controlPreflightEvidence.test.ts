import test from "node:test";
import assert from "node:assert/strict";
import { isLiveModelControlEvidence } from "@/lib/playRealtime/controlPreflightEvidence";

test("only a successful model result counts as live control evidence", () => {
  assert.equal(isLiveModelControlEvidence({ ok: true, source: "model" }), true);
  assert.equal(isLiveModelControlEvidence({ ok: true, source: "fast_path" }), false);
  assert.equal(isLiveModelControlEvidence({ ok: true, source: "cache" }), false);
  assert.equal(isLiveModelControlEvidence({ ok: false, source: "unavailable" }), false);
});

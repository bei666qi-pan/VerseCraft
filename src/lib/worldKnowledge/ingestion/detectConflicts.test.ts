import assert from "node:assert/strict";
import { test } from "node:test";
import { detectConflicts } from "./detectConflicts";
import type { ScopedFact } from "./classifyFactScope";

function mkFact(scope: ScopedFact["scope"], text: string): ScopedFact {
  return {
    scope,
    text,
    normalized: text,
    source: "user_input",
    confidence: 0.9,
    evidence: [],
    entityHints: [],
    userId: "u1",
    sessionId: "s1",
    reasons: [],
  };
}

test("与 core canon 冲突的共享候选会被拒绝直入共享", async () => {
  const out = await detectConflicts({
    facts: [mkFact("shared_candidate", "公寓真相被推翻")],
    probe: {
      async hasCoreConflict() {
        return true;
      },
      async hasSharedConflict() {
        return false;
      },
      async hasPrivateConflict() {
        return false;
      },
    },
  });
  assert.equal(out[0]?.action, "reject_shared_direct");
  assert.equal(out[0]?.status, "conflicted_core");
});

test("私有事实冲突允许 superseded 版本写入", async () => {
  const out = await detectConflicts({
    facts: [mkFact("user_private", "我在仓库见过钥匙")],
    probe: {
      async hasCoreConflict() {
        return false;
      },
      async hasSharedConflict() {
        return false;
      },
      async hasPrivateConflict() {
        return true;
      },
    },
  });
  assert.equal(out[0]?.action, "allow_private");
  assert.equal(out[0]?.status, "superseded_private");
});

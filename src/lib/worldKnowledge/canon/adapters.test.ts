import assert from "node:assert/strict";
import { test } from "node:test";
import { toCanonFactV1 } from "./adapters";
import type { LoreFact } from "@/lib/worldKnowledge/types";

test("CanonFactV1 adapter fills fallback provenance fields", () => {
  const fact: LoreFact = {
    identity: { factKey: "npc:N-010" },
    layer: "core_canon",
    factType: "npc",
    canonicalText: "N-010 surface persona",
    source: { kind: "registry", entityId: "N-010" },
    tags: ["npc", "N-010", "reveal_surface"],
  };
  const canon = toCanonFactV1(fact);
  assert.equal(canon.factId, "npc:N-010");
  assert.equal(canon.truthClass, "verified");
  assert.ok(canon.audience.includes("present_npcs"));
  assert.equal(canon.revealMinRank, 0);
  assert.equal(canon.evidenceRefs.length, 1);
  assert.equal(canon.evidenceRefs[0]!.sourceType, "registry");
  assert.equal(canon.specificNpcIds?.[0], "N-010");
});

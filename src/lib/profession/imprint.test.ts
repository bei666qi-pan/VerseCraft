import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProfessionImprintCodex,
  buildProfessionIssuerRelationshipDelta,
  getProfessionImprintFlag,
} from "./imprint";

test("profession imprint helpers are stable and explicit", () => {
  assert.equal(getProfessionImprintFlag("守灯人"), "profession.certified.守灯人");
  const codex = buildProfessionImprintCodex("齐日角");
  assert.equal(codex.id, "profession_imprint_齐日角");
  assert.equal(codex.type, "anomaly");
  const rel = buildProfessionIssuerRelationshipDelta("巡迹客");
  assert.equal(rel.npcId, "N-014");
  assert.equal(rel.favorabilityDelta, 3);
});


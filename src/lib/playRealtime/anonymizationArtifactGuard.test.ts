import assert from "node:assert/strict";
import test from "node:test";
import { applyAnonymizationArtifactGuard } from "./anonymizationArtifactGuard";

test("repairs live grammatical substitutions without changing a real stranger", () => {
  const out = applyAnonymizationArtifactGuard({ narrative: "大堂的陌生人在头顶嗡嗡响，日期写着上陌生人，但今天已经不同。门口确有一个陌生人。" });
  assert.equal(out.narrative, "大堂的日光灯在头顶嗡嗡响，日期写着上周，但今天已经不同。门口确有一个陌生人。");
  assert.ok((out._commit_flags as string[]).includes("anonymization_artifact_repaired_v1"));
});

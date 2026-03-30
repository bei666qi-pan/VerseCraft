import test from "node:test";
import assert from "node:assert/strict";
import { getVerseCraftRolloutFlags } from "./versecraftRolloutFlags";

test("getVerseCraftRolloutFlags 默认全开（可逐项 env 关闭）", () => {
  const f = getVerseCraftRolloutFlags();
  assert.equal(f.enableSpaceAuthorityCanon, true);
  assert.equal(f.enableNpcSocialSurface, true);
  assert.equal(f.enableStyleGuidePacket, true);
  assert.equal(f.enableUiDebugDiagnostics, false);
});

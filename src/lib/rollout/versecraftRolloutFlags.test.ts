import test from "node:test";
import assert from "node:assert/strict";
import { getVerseCraftRolloutFlags } from "./versecraftRolloutFlags";

test("getVerseCraftRolloutFlags 默认全开（可逐项 env 关闭）", () => {
  const f = getVerseCraftRolloutFlags();
  assert.equal(f.enableSettingsTaskRemoval, true);
  assert.equal(f.enableSpaceAuthorityCanon, true);
  assert.equal(f.enableNpcSocialSurface, true);
  assert.equal(f.enableStyleGuidePacket, true);
  assert.equal(f.enableTaskVisibilityPolicyV3, true);
  assert.equal(f.enableTaskAutoOpenOnNarrativeGrant, true);
  assert.equal(f.enablePlayerFacingTaskCopyV2, true);
  assert.equal(f.enableOptionsAutoRegenOnEmpty, true);
  assert.equal(f.enableOptionsOnlyRegenPathV2, true);
  assert.equal(f.enableNewPlayerGuideDualCoreV2, true);
  assert.equal(f.enableWorldFeelPackets, true);
  assert.equal(f.enableMonthStartStudentWorldlogic, true);
  assert.equal(f.enableUiDebugDiagnostics, false);
});

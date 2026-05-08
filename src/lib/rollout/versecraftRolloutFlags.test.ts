import test from "node:test";
import assert from "node:assert/strict";
import { getVerseCraftRolloutFlags } from "./versecraftRolloutFlags";

function withEnv<T>(name: string, value: string | undefined, fn: () => T): T {
  const prev = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
}

test("getVerseCraftRolloutFlags defaults match current mainline", () => {
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
  assert.equal(f.enableProfessionIdentityLoop, true);
  assert.equal(f.enableProfessionTrialNarrativeGrant, true);
  assert.equal(f.enableProfessionPromptDietV1, true);
  assert.equal(f.enableWeaponLifecycleV1, true);
  assert.equal(f.enableCombatSummaryV1, false);
  assert.equal(f.enableWeaponizationPreview, true);
  assert.equal(f.enablePlayabilityCoreLoopsV1, true);
  assert.equal(f.enableWorldFeelLoopPackets, true);
  assert.equal(f.enableActorIdentityAnalytics, true);
  assert.equal(f.enableGuestUnifiedMetrics, true);
  assert.equal(f.enableSessionClockV1, true);
  assert.equal(f.enableAdminPlaystyleMetrics, true);
  assert.equal(f.enableSceneActorGateV1, true);
  assert.equal(f.enableSceneActorGateValidatorV1, true);
  assert.equal(f.enableModeAwareNpcPersonaPacketV1, true);
  assert.equal(f.enablePlayerEchoCanon, false);
  assert.equal(f.enablePlayerEchoPersistence, false);
  assert.equal(f.enablePlayerEchoPromptPacket, false);
  assert.equal(f.enablePlayerEchoValidator, false);
});

test("SceneActorGate rollout flags can be disabled by env", () => {
  withEnv("VERSECRAFT_ENABLE_SCENE_ACTOR_GATE_V1", "0", () => {
    assert.equal(getVerseCraftRolloutFlags().enableSceneActorGateV1, false);
  });
  withEnv("VERSECRAFT_ENABLE_SCENE_ACTOR_GATE_VALIDATOR_V1", "false", () => {
    assert.equal(getVerseCraftRolloutFlags().enableSceneActorGateValidatorV1, false);
  });
  withEnv("VERSECRAFT_ENABLE_MODE_AWARE_NPC_PERSONA_PACKET_V1", "off", () => {
    assert.equal(getVerseCraftRolloutFlags().enableModeAwareNpcPersonaPacketV1, false);
  });
});

test("Player Echo rollout flags are opt-in", () => {
  withEnv("VERSECRAFT_ENABLE_PLAYER_ECHO_CANON", "1", () => {
    assert.equal(getVerseCraftRolloutFlags().enablePlayerEchoCanon, true);
  });
  withEnv("VERSECRAFT_ENABLE_PLAYER_ECHO_PERSISTENCE", "true", () => {
    assert.equal(getVerseCraftRolloutFlags().enablePlayerEchoPersistence, true);
  });
  withEnv("VERSECRAFT_ENABLE_PLAYER_ECHO_PROMPT_PACKET", "on", () => {
    assert.equal(getVerseCraftRolloutFlags().enablePlayerEchoPromptPacket, true);
  });
  withEnv("VERSECRAFT_ENABLE_PLAYER_ECHO_VALIDATOR", "1", () => {
    assert.equal(getVerseCraftRolloutFlags().enablePlayerEchoValidator, true);
  });
});

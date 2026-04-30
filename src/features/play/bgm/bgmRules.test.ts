import assert from "node:assert/strict";
import test from "node:test";
import { resolveBgmTrackKey } from "@/config/audio";
import { selectBgmForTurn } from "./bgmRules";

test("selectBgmForTurn prioritizes death over combat and boss signals", () => {
  const selected = selectBgmForTurn({
    dm: {
      is_death: true,
      conflict_outcome: { outcomeTier: "loss" },
      main_threat_updates: [{ floorId: "B2", threatId: "A-008", phase: "breached" }],
      sanity_damage: 20,
    },
    previousTrack: "bgm_2f_daily",
    previousLocation: "2F_Corridor",
    nextLocation: "B2_GatekeeperDomain",
  });

  assert.equal(selected.track, "bgm_character_death");
  assert.equal(selected.reason, "character_death");
});

test("selectBgmForTurn transitions from combat to battle resolved when danger clears", () => {
  const selected = selectBgmForTurn({
    dm: { is_death: false, sanity_damage: 0, player_location: "B1_SafeZone" },
    previousTrack: "bgm_combat_encounter",
    previousLocation: "2F_Corridor",
    nextLocation: "B1_SafeZone",
    previousStats: { sanity: 30 },
    nextStats: { sanity: 30 },
  });

  assert.equal(selected.track, "bgm_battle_resolved");
  assert.equal(selected.reason, "battle_resolved");
});

test("selectBgmForTurn does not force sanity collapse in B1 for low sanity alone", () => {
  const selected = selectBgmForTurn({
    dm: { is_death: false, sanity_damage: 0, player_location: "B1_SafeZone" },
    previousTrack: "bgm_b1_daily",
    previousLocation: "B1_Storage",
    nextLocation: "B1_SafeZone",
    previousStats: { sanity: 9 },
    nextStats: { sanity: 9 },
  });

  assert.equal(selected.track, "bgm_b1_daily");
  assert.equal(selected.reason, "same_floor_daily");
});

test("selectBgmForTurn keeps same-floor daily music and changes on cross-floor movement", () => {
  const sameFloor = selectBgmForTurn({
    dm: { is_death: false, sanity_damage: 0, player_location: "1F_Mailboxes" },
    previousTrack: "bgm_1f_daily",
    previousLocation: "1F_Lobby",
    nextLocation: "1F_Mailboxes",
  });
  const crossFloor = selectBgmForTurn({
    dm: { is_death: false, sanity_damage: 0, player_location: "2F_Clinic201" },
    previousTrack: "bgm_1f_daily",
    previousLocation: "1F_Lobby",
    nextLocation: "2F_Clinic201",
  });

  assert.equal(sameFloor.track, "bgm_1f_daily");
  assert.equal(sameFloor.reason, "same_floor_daily");
  assert.equal(crossFloor.track, "bgm_2f_daily");
  assert.equal(crossFloor.reason, "floor_daily");
});

test("selectBgmForTurn treats active main threats as combat even without conflict text", () => {
  const selected = selectBgmForTurn({
    dm: {
      is_death: false,
      sanity_damage: 0,
      player_location: "B2_Passage",
      main_threat_updates: [{ floorId: "B2", threatId: "A-008", phase: "active" }],
    },
    previousTrack: "bgm_b1_daily",
    previousLocation: "B1_SafeZone",
    nextLocation: "B2_Passage",
  });

  assert.equal(selected.track, "bgm_combat_encounter");
  assert.equal(selected.reason, "combat");
});

test("selectBgmForTurn treats 7F administrator truth reveal as endgame pressure", () => {
  const selected = selectBgmForTurn({
    dm: {
      is_death: false,
      sanity_damage: 0,
      player_location: "7F_SealedDoor",
      codex_updates: [{ id: "admin_truth", name: "管理员真相", type: "anomaly" }],
    },
    previousTrack: "bgm_7f_daily",
    previousLocation: "7F_Bench",
    nextLocation: "7F_SealedDoor",
  });

  assert.equal(selected.track, "bgm_endgame_high_pressure");
  assert.equal(selected.reason, "boss_or_endgame");
});

test("legacy bgm keys resolve to new hashed-track registry keys", () => {
  assert.equal(resolveBgmTrackKey("bgm_1_calm"), "bgm_b1_daily");
  assert.equal(resolveBgmTrackKey("bgm_8_boss"), "bgm_endgame_high_pressure");
});

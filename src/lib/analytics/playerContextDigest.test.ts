import test from "node:test";
import assert from "node:assert/strict";
import { buildPlayerContextDigest, inferWeaponizationAttempted } from "./playerContextDigest";

test("buildPlayerContextDigest extracts profession flags and weapon maintenance bands", () => {
  const ctx =
    "游戏时间[第1日 2时]。用户位置[B1_Storage]。世界标记：profession.certified.守灯人，profession.trial.offered.巡迹客。" +
    "主手武器[WPN-001|稳定60|反制sound/silence|污染45|可修复1]。" +
    "职业状态：当前[守灯人]，已认证[守灯人]，可认证[巡迹客]，被动[perk.x]。" +
    "图鉴已解锁：电工老刘[npc|好感28]，麟泽[npc|好感10]。";
  const d = buildPlayerContextDigest(ctx);
  assert.equal(d.professionCurrent, "守灯人");
  assert.equal(d.professionCertified, true);
  assert.equal(d.professionTrialOffered, true);
  assert.equal(d.weaponNeedsMaintenance, true);
  assert.equal(d.weaponPollutionHigh, false);
  assert.equal(d.guideHitLiu, true);
  assert.equal(d.guideHitLinz, true);
});

test("inferWeaponizationAttempted detects forge_weaponize commands", () => {
  assert.equal(inferWeaponizationAttempted("forge_weaponize_c 选择道具A"), true);
});


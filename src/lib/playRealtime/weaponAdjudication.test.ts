import test from "node:test";
import assert from "node:assert/strict";
import { applyWeaponTacticalAdjudication } from "./weaponAdjudication";

test("weapon tactical adjudication: no equipped weapon does not grant advantage (active threat gets +1 sanity damage)", () => {
  const out = applyWeaponTacticalAdjudication({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你试图强行推进。",
      is_death: false,
      player_location: "2F_Corridor",
      main_threat_updates: [{ floorId: "2", threatId: "A-004", phase: "active", suppressionProgress: 20 }],
    },
    playerContext: "用户位置[2F_Corridor]。原石[0]。行囊道具：空。",
    latestUserInput: "我硬闯过去",
    requestId: "test-req-1",
  });

  assert.equal(out.sanity_damage, 1);
  assert.ok(String(out.narrative).includes("没有装备武器"));
});

test("weapon tactical adjudication: matching weapon affects damage and writes durability state", () => {
  const out = applyWeaponTacticalAdjudication({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 3,
      narrative: "你把导电胶带压进走廊里的红水。",
      is_death: false,
      player_location: "2F_Corridor",
      main_threat_updates: [{ floorId: "2", threatId: "A-004", phase: "active", suppressionProgress: 20 }],
    },
    playerContext: "用户位置[2F_Corridor]。主手武器[WPN-001|稳定95|反制liquid/conductive|模组conductive|灌注liquid:1|污染0|可修复1]。",
    latestUserInput: "我用导电封管压制红水",
    requestId: "weapon-positive-0",
  });

  assert.equal(out.sanity_damage, 1);
  const threat = (out.main_threat_updates as Array<Record<string, unknown>>)[0]!;
  assert.equal(threat.suppressionProgress, 35);
  const updates = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as Record<string, unknown>).weaponId, "WPN-001");
  assert.equal((updates[0] as Record<string, unknown>).contamination, 2);
  assert.equal((updates[0] as Record<string, unknown>).stability, 94);
  assert.ok(String(out.narrative).includes("实际损耗"));
  assert.match(String(out.narrative), /威胁只是暂退，还没有结束/);
  assert.equal(String(out.narrative).includes("以本回合状态结算为准"), false);
  assert.equal(String(out.narrative).includes("可靠性"), false);
});

test("weapon tactical adjudication: reconnaissance does not spend weapon durability or append settlement prose", () => {
  const out = applyWeaponTacticalAdjudication({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 2,
      narrative: "我沿走廊确认异常的位置。",
      is_death: false,
      player_location: "3F_Corridor",
      main_threat_updates: [{ floorId: "3", threatId: "A-3F-SHADOW", phase: "active" }],
    },
    playerContext: "",
    latestUserInput: "在当前位置寻找已经存在的威胁进入战斗；若没有威胁，不得凭空生成敌人。",
    requestId: "recon-is-not-strike",
    clientState: {
      equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72, contamination: 0 },
    } as any,
  });
  assert.deepEqual(out.weapon_updates, undefined);
  assert.equal(String(out.narrative).includes("战术裁决"), false);
  assert.equal(String(out.narrative).includes("实际损耗"), false);
});

// 修复：此前本函数只会用正则解析 playerContext，且 counterThreatIds 永远按 id 去旧的 4 件固定表回查——
// 一把“道具武器化”生成的武器（id 不在旧表里）无论实际 counterThreatIds 是什么，都会静默变成空数组。
// 现在优先信任结构化 clientState.equippedWeapon 自带的字段。用同一个 requestId（reliability 采样种子相同）
// 对比“对味”与“不对味”两把同 id 武器，只有 counterThreatIds 不同：命中的一侧伤害应更低或相等。
test("weapon tactical adjudication: 优先信任结构化 clientState，counterThreatIds 来自武器自身字段而非旧表回查", () => {
  const baseArgs = {
    playerContext: "用户位置[2F_Corridor]。", // 故意不含任何武器信息，验证不再依赖它
    latestUserInput: "我压制红水",
    requestId: "weapon-clientstate-fixed-seed",
  };
  const dmRecord = () => ({
    is_action_legal: true,
    sanity_damage: 3,
    narrative: "你尝试压制。",
    is_death: false,
    player_location: "2F_Corridor",
    main_threat_updates: [{ floorId: "2", threatId: "A-004", phase: "active", suppressionProgress: 20 }],
  });

  const matching = applyWeaponTacticalAdjudication({
    ...baseArgs,
    dmRecord: dmRecord(),
    clientState: {
      equippedWeapon: {
        id: "WZ-C-abc123",
        name: "武器化测试·对味",
        counterThreatIds: ["A-004"],
        counterTags: [],
        stability: 90,
        contamination: 0,
        repairable: true,
        currentMods: [],
        currentInfusions: [],
      },
    } as any,
  });

  const mismatched = applyWeaponTacticalAdjudication({
    ...baseArgs,
    dmRecord: dmRecord(),
    clientState: {
      equippedWeapon: {
        id: "WZ-C-abc123",
        name: "武器化测试·不对味",
        counterThreatIds: [],
        counterTags: [],
        stability: 90,
        contamination: 0,
        repairable: true,
        currentMods: [],
        currentInfusions: [],
      },
    } as any,
  });

  assert.ok((matching.sanity_damage as number) <= (mismatched.sanity_damage as number));
  const matchedUpdates = Array.isArray(matching.weapon_updates) ? matching.weapon_updates : [];
  assert.equal(matchedUpdates.length, 1);
  assert.equal((matchedUpdates[0] as Record<string, unknown>).weaponId, "WZ-C-abc123");
});

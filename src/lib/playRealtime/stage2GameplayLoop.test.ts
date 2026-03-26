import test from "node:test";
import assert from "node:assert/strict";
import { applyB1ServiceExecutionGuard } from "./serviceExecution";
import { applyMainThreatUpdateGuard } from "./mainThreatGuard";
import { applyStage2SettlementGuard } from "./settlementGuard";
import { buildRuntimeContextPackets } from "./runtimeContextPackets";

type DmRecord = Record<string, unknown>;

function runFinalGuards(input: DmRecord, latestUserInput: string, playerContext: string): DmRecord {
  let dm = { ...input };
  // Stage2 tests now feed structured clientState; playerContext 仅作叙事提示，不再用于关键裁决。
  dm = applyB1ServiceExecutionGuard({
    dmRecord: dm,
    latestUserInput,
    playerContext,
    clientState: {
      v: 1,
      turnIndex: 0,
      playerLocation: typeof input.player_location === "string" ? String(input.player_location) : "B1_PowerRoom",
      time: { day: 1, hour: 8 },
      stats: { sanity: 60, agility: 60, luck: 60, charm: 60, background: 60 },
      originium: 8,
      inventoryItemIds: ["I-C03", "I-C12", "I-C02"],
      warehouseItemIds: ["W-B101", "W-107"],
      equippedWeapon: {
        id: "WPN-001",
        name: "旧武器",
        description: "d",
        counterThreatIds: [],
        counterTags: ["sound", "silence", "mirror", "direction"],
        stability: 55,
        calibratedThreatId: null,
        modSlots: ["core", "surface"],
        currentMods: [],
        currentInfusions: [],
        contamination: 30,
        repairable: true,
      },
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  dm = applyMainThreatUpdateGuard({ dmRecord: dm, playerContext });
  dm = applyStage2SettlementGuard(dm);
  return dm;
}

test("stage2 loop: 上楼-受压-压制-回B1整备-再上楼", () => {
  const ctxB1Ready =
    "游戏时间[第1日 8时]。用户位置[B1_PowerRoom]。原石[8]。" +
    "行囊道具：防爆手电筒[I-C03|C]，备用电池[I-C12|C]，破裂的八卦镜[I-C02|C]。" +
    "仓库物品：配电间的绝缘胶带[W-B101]，保安室的镜子碎片[W-107]。" +
    "主威胁状态：2[A-002|active|20]。" +
    "主手武器[WPN-001|稳定55|反制sound/silence|模组无|灌注无|污染30|可修复1]。" +
    "任务追踪：压制二层主威胁[main|active|委托N-008|层级2F|领取auto]。" +
    "NPC当前位置：N-008@B1_PowerRoom。";

  const preview = runFinalGuards(
    {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你回到配电间。",
      is_death: false,
      player_location: "B1_PowerRoom",
      new_tasks: [{ id: "t_stage2_2f", title: "压制二层主威胁" }],
    },
    "我查看锻造台并准备上楼",
    ctxB1Ready
  );
  assert.equal(preview.is_action_legal, true);
  assert.ok(String(preview.narrative).includes("锻造台"));
  assert.ok(Array.isArray(preview.options));

  const wrong2f = runFinalGuards(
    {
      is_action_legal: true,
      sanity_damage: 2,
      narrative: "你误触回响，威胁逼近。",
      is_death: false,
      player_location: "2F_Corridor",
    },
    "我直接冲向黑暗处",
    "用户位置[2F_Corridor]。"
  );
  const mt1 = Array.isArray(wrong2f.main_threat_updates) ? wrong2f.main_threat_updates : [];
  assert.equal(mt1.length, 1);
  assert.equal((mt1[0] as { phase?: string }).phase, "breached");

  const right2f = runFinalGuards(
    {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你利用镜面反制并争取撤离窗口。",
      is_death: false,
      player_location: "2F_Corridor",
      main_threat_updates: [{ floorId: "2", threatId: "A-002", phase: "suppressed", suppressionProgress: 75 }],
      weapon_updates: [{ weaponId: "WPN-001", stability: 48 }],
    },
    "我用镜面反制后后撤",
    "用户位置[2F_Corridor]。"
  );
  const mt2 = Array.isArray(right2f.main_threat_updates) ? right2f.main_threat_updates : [];
  assert.equal((mt2[0] as { phase?: string }).phase, "suppressed");
  assert.equal((mt2[0] as { suppressionProgress?: number }).suppressionProgress, 75);

  const repair = runFinalGuards(
    {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备修复武器。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    "我在配电间修复主手武器",
    ctxB1Ready
  );
  const wu = Array.isArray(repair.weapon_updates) ? repair.weapon_updates : [];
  assert.equal(wu.length, 1);
  assert.ok(((wu[0] as { stability?: number }).stability ?? 0) > 55);
  assert.equal(repair.currency_change, -1);

  const packets = buildRuntimeContextPackets({
    playerContext: ctxB1Ready,
    latestUserInput: "我准备上楼继续压制二层主威胁",
    playerLocation: "B1_PowerRoom",
    serviceState: { forgeUnlocked: true, shopUnlocked: true, anchorUnlocked: true, unlockFlags: {} },
    runtimeLoreCompact: "【RAG-Lore精简片段】\n- [rule] 二层回响体对镜像反制敏感",
  });
  assert.ok(packets.includes("main_threat_packet"));
  assert.ok(packets.includes("weapon_packet"));
  assert.ok(packets.includes("forge_packet"));
  assert.ok(packets.includes("tactical_context_packet"));
});

test("narrative mentions forge success with state writeback", () => {
  const out = runFinalGuards(
    {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你完成了锻造操作。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    "执行 forge_mod_mirror",
    "用户位置[B1_PowerRoom]。原石[6]。行囊道具：破裂的八卦镜[I-C02|C]。仓库物品：保安室的镜子碎片[W-107]。主手武器[WPN-003|稳定70|反制mirror/direction|模组无|灌注无|污染0|可修复1]。NPC当前位置：N-008@B1_PowerRoom。"
  );
  assert.ok(String(out.narrative).includes("改装"));
  const wu = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(wu.length, 1);
});


import test from "node:test";
import assert from "node:assert/strict";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import {
  buildMajorNpcRelinkPacket,
  computeMajorNpcRelinkStates,
  XINLAN_MAJOR_NPC_ID,
} from "@/lib/registry/majorNpcRelinkRegistry";

test("majorNpcRelink: 阶段 1 默认职能壳", () => {
  const ctx = "游戏时间[第1日 0时]。用户位置[B1_SafeZone]。世界标记：无。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const entries = computeMajorNpcRelinkStates({
    playerContext: ctx,
    signals,
    nearbyNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.ok(entries.every((e) => e.relinkPhase === 1));
  assert.ok(entries.every((e) => e.surfaceRelationDominant));
});

test("majorNpcRelink: 欣蓝牵引打开后他人可到阶段 3", () => {
  const ctx =
    "游戏时间[第3日 0时]。用户位置[1F_PropertyOffice]。图鉴已解锁：欣蓝[npc|好感52]，麟泽[npc|好感60]。世界标记：无。任务追踪：物业登记协助[进行中|委托欣蓝|地点1F]。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const entries = computeMajorNpcRelinkStates({
    playerContext: ctx,
    signals,
    nearbyNpcIds: [XINLAN_MAJOR_NPC_ID, "N-015"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  const xinlan = entries.find((e) => e.npcId === XINLAN_MAJOR_NPC_ID);
  const lin = entries.find((e) => e.npcId === "N-015");
  assert.equal(xinlan?.relinkPhase, 3);
  assert.equal(lin?.relinkPhase, 3);
});

test("majorNpcRelink: 无牵引无危机时麟泽卡在阶段 2", () => {
  const ctx =
    "游戏时间[第2日 0时]。用户位置[B1_SafeZone]。图鉴已解锁：麟泽[npc|好感60]。世界标记：无。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const entries = computeMajorNpcRelinkStates({
    playerContext: ctx,
    signals,
    nearbyNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const lin = entries.find((e) => e.npcId === "N-015");
  assert.equal(lin?.relinkPhase, 2);
  assert.equal(lin?.inOldLoop, false);
});

test("majorNpcRelink: 危机窗口可替代牵引", () => {
  const ctx =
    "游戏时间[第2日 0时]。用户位置[B1_SafeZone]。图鉴已解锁：麟泽[npc|好感60]。世界标记：无。死亡累计[1]。主威胁状态：B1[T1|breached|0]。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const entries = computeMajorNpcRelinkStates({
    playerContext: ctx,
    signals,
    nearbyNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  const lin = entries.find((e) => e.npcId === "N-015");
  assert.equal(lin?.relinkPhase, 3);
  assert.equal(lin?.phase3Traction, "crisis_pressure");
});

test("majorNpcRelink: buildMajorNpcRelinkPacket 六人 entries", () => {
  const ctx = "游戏时间[第1日 0时]。用户位置[B1_SafeZone]。世界标记：无。";
  const signals = parsePlayerWorldSignals(ctx, null);
  const p = buildMajorNpcRelinkPacket({
    playerContext: ctx,
    signals,
    nearbyNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.equal(p.schema, "major_npc_relink_v1");
  assert.equal(p.entries.length, 6);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCycleTimePacket,
  computeCycleTimeState,
  positionInDecade,
  flashProximityForPosition,
} from "@/lib/registry/cycleMoonFlashRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

test("positionInDecade 与日历日取模 10 对齐", () => {
  assert.equal(positionInDecade(1), 1);
  assert.equal(positionInDecade(10), 10);
  assert.equal(positionInDecade(11), 1);
  assert.equal(positionInDecade(17), 7);
});

test("computeCycleTimeState：第 8 日位相为前兆带、接近闪烁压强", () => {
  const s = parsePlayerWorldSignals("游戏时间[第8日 12时]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。", null);
  const st = computeCycleTimeState(s);
  assert.equal(st.positionInDecade, 8);
  assert.equal(st.cyclePhase, "precursor");
  assert.equal(st.flashProximity, "precursor_band");
  assert.equal(st.precursorPhaseActive, true);
  assert.equal(st.nearFlashPressure, true);
});

test("computeCycleTimeState：第 10 日闪烁迫近", () => {
  const s = parsePlayerWorldSignals("游戏时间[第10日 0时]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。", null);
  const st = computeCycleTimeState(s);
  assert.equal(st.cyclePhase, "correction_window");
  assert.equal(flashProximityForPosition(st.positionInDecade), "imminent");
});

test("parsePlayerWorldSignals：本轮锚点重构标记", () => {
  const s = parsePlayerWorldSignals(
    "游戏时间[第5日 9时]。世界标记：无。本轮锚点重构[1]。锚点解锁：B1[1]，1F[1]，7F[0]。",
    null
  );
  assert.equal(s.anchorRebuiltThisCycle, true);
});

test("buildCycleTimePacket：surface 仅给节律收紧提示", () => {
  const s = parsePlayerWorldSignals("游戏时间[第4日 9时]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。", null);
  const p = buildCycleTimePacket({
    signals: s,
    nearbyMajorNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.equal(p.band, "surface");
  assert.equal(p.rhythmTightens, true);
  assert.equal(p.positionInDecade, undefined);
});

test("buildCycleTimePacket：deep 含 moonSemantic 与失败痕迹枚举", () => {
  const s = parsePlayerWorldSignals("游戏时间[第9日 8时]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。", null);
  const p = buildCycleTimePacket({
    signals: s,
    nearbyMajorNpcIds: ["N-010", "N-015"],
    maxRevealRank: REVEAL_TIER_RANK.deep,
  });
  assert.equal(p.band, "mechanism");
  assert.ok(Array.isArray(p.failureTraceKinds));
  assert.ok((p.failureTraceKinds as string[]).includes("residual_echo"));
  assert.ok(p.moonSemanticKey);
  const rows = p.npcTimeMemoryNearby as Array<{ npcId: string; timeMemoryCategory: string }>;
  assert.ok(rows.some((r) => r.npcId === "N-010" && r.timeMemoryCategory === "emotion_fragment"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSchoolCycleExperiencePacket,
  RESIDUAL_EVIDENCE_CHANNELS,
  FAILURE_CARRYOVER_META,
} from "@/lib/registry/playerExperienceSchoolCycleRegistry";
import { parsePlayerWorldSignals } from "@/lib/registry/playerWorldSignals";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

test("RESIDUAL_EVIDENCE_CHANNELS 与 FAILURE 五类对齐", () => {
  assert.strictEqual(RESIDUAL_EVIDENCE_CHANNELS.length, 5);
});

test("buildSchoolCycleExperiencePacket：surface 仅 band+pullLine", () => {
  const s = parsePlayerWorldSignals(
    "游戏时间[第1日 9时]。世界标记：无。锚点解锁：B1[1]，1F[1]，7F[0]。",
    null
  );
  const p = buildSchoolCycleExperiencePacket({
    signals: s,
    nearbyMajorNpcIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.strictEqual(p.band, "surface");
  assert.ok(String(p.pullLine).length > 10);
});

test("buildSchoolCycleExperiencePacket：fracture 含 residue 与 npcInitiative", () => {
  const s = parsePlayerWorldSignals(
    "游戏时间[第8日 9时]。世界标记：xp.test_flag，cycle_residue.echo。锚点解锁：B1[1]，1F[1]，7F[0]。",
    null
  );
  const p = buildSchoolCycleExperiencePacket({
    signals: s,
    nearbyMajorNpcIds: ["N-010"],
    maxRevealRank: REVEAL_TIER_RANK.fracture,
  });
  assert.strictEqual(p.band, "fracture");
  assert.ok(Array.isArray(p.residuePerception));
  assert.ok(Array.isArray(p.npcInitiative));
  assert.ok((p.litByWorldFlags as string[]).includes("xp.test_flag"));
});

test("FAILURE_CARRYOVER_META 含四类", () => {
  const cats = new Set(FAILURE_CARRYOVER_META.map((x) => x.category));
  assert.ok(cats.has("cognitive"));
  assert.ok(cats.has("route"));
  assert.ok(cats.has("relationship"));
  assert.ok(cats.has("clue"));
});

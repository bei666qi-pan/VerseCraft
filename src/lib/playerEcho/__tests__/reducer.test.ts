import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlayerEchoCanon, reducePlayerEchoCandidates } from "@/lib/playerEcho/reducer";
import type { EchoFragment } from "@/lib/playerEcho/types";

function fragment(overrides: Partial<EchoFragment>): EchoFragment {
  return {
    id: "f",
    type: "promise",
    targetType: "npc",
    targetId: "N-010",
    summary: "曾在登记口前停下，没有把话说完",
    safetyLevel: 2,
    emotionalWeight: 0.6,
    salience: 0.7,
    confidence: 0.8,
    status: "active",
    anchors: { npcIds: ["N-010"], locationIds: ["B1_SafeZone"] },
    ...overrides,
  };
}

test("playerEcho reducer deduplicates by type targetType targetId and caps lists", () => {
  const next = reducePlayerEchoCandidates(null, {
    loopCount: 2,
    fragments: [
      fragment({ id: "a", summary: "较弱残响", emotionalWeight: 0.2 }),
      fragment({ id: "b", summary: "更强残响", emotionalWeight: 0.9, salience: 0.9 }),
      fragment({ id: "c", type: "death_mark", targetType: "floor", targetId: "7", summary: "七楼边缘有失败的冷感" }),
    ],
    strongestChoices: Array.from({ length: 12 }, (_, i) => `choice-${i}`),
    unresolvedRegrets: Array.from({ length: 10 }, (_, i) => `regret-${i}`),
    repeatedDeathCauses: Array.from({ length: 9 }, (_, i) => `death-${i}`),
    stableEchoSummary: "稳".repeat(300),
    lastRunSummary: "末".repeat(300),
  });

  assert.equal(next.fragments.length, 2);
  assert.equal(next.fragments.some((item) => item.id === "b"), true);
  assert.equal(next.strongestChoices.length, 8);
  assert.equal(next.unresolvedRegrets.length, 8);
  assert.equal(next.repeatedDeathCauses.length, 6);
  assert.equal(next.stableEchoSummary?.length, 240);
  assert.equal(next.lastRunSummary?.length, 240);
});

test("playerEcho reducer rejects empty summaries invalid safety and non-finite emotion", () => {
  const canon = normalizePlayerEchoCanon({
    fragments: [
      fragment({ id: "empty", summary: "   " }),
      fragment({ id: "unsafe", safetyLevel: 5 as EchoFragment["safetyLevel"] }),
      fragment({ id: "bad_weight", emotionalWeight: Number.POSITIVE_INFINITY }),
      fragment({ id: "valid", summary: "一条可用残响" }),
    ],
    stableEchoSummary: "   ",
    lastRunSummary: "",
  });

  assert.deepEqual(canon.fragments.map((item) => item.id), ["valid"]);
  assert.equal(canon.stableEchoSummary, null);
  assert.equal(canon.lastRunSummary, null);
});

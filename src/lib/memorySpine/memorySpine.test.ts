import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyMemorySpine } from "@/lib/memorySpine/types";
import { reduceMemoryCandidates } from "@/lib/memorySpine/reducer";
import { pruneMemorySpine } from "@/lib/memorySpine/prune";
import { buildRecallContext, selectMemoryRecallPacket } from "@/lib/memorySpine/selectors";
import { buildMemoryRecallBlock } from "@/lib/memorySpine/prompt";

test("memorySpine: same mergeKey should merge rather than explode", () => {
  const nowHour = 10;
  const prev = createEmptyMemorySpine();
  const next = reduceMemoryCandidates({
    prev,
    nowHour,
    candidates: [
      {
        kind: "relationship_shift",
        scope: "npc_local",
        summary: "你与N-010的关系变差。",
        salience: 0.6,
        confidence: 0.8,
        status: "active",
        ttlHours: 72,
        mergeKey: "rel:N-010",
        anchors: { npcIds: ["N-010"] },
        recallTags: ["rel_shift"],
        source: "relationship_update",
        promoteToLore: false,
      },
      {
        kind: "relationship_shift",
        scope: "npc_local",
        summary: "你与N-010的关系进一步恶化。",
        salience: 0.7,
        confidence: 0.85,
        status: "active",
        ttlHours: 72,
        mergeKey: "rel:N-010",
        anchors: { npcIds: ["N-010"], locationIds: ["1F_Hall"] },
        recallTags: ["rel_shift", "npc_alert"],
        source: "relationship_update",
        promoteToLore: false,
      },
    ],
  });
  assert.equal(next.entries.length, 1);
  assert.equal(next.entries[0]!.mergeKey, "rel:N-010");
  assert.equal(next.entries[0]!.salience >= 0.7, true);
  assert.equal(next.entries[0]!.confidence >= 0.85, true);
  assert.equal((next.entries[0]!.anchors.locationIds ?? []).includes("1F_Hall"), true);
});

test("memorySpine: ttl should expire and prune removes old entries", () => {
  const base = {
    v: 1 as const,
    entries: [
      {
        id: "m1",
        kind: "route_hint",
        scope: "location_local",
        summary: "你已抵达B1_SafeZone。",
        salience: 0.4,
        confidence: 0.9,
        status: "active",
        createdAtHour: 0,
        lastTouchedAtHour: 0,
        ttlHours: 2,
        mergeKey: "loc:B1_SafeZone",
        anchors: { locationIds: ["B1_SafeZone"], floorIds: ["B1"] },
        recallTags: ["loc_arrival"],
        source: "location_change",
        promoteToLore: false,
      },
    ],
  };
  const pruned = pruneMemorySpine(base as any, 5, { maxEntries: 64 });
  assert.equal(pruned.entries.length, 0);
});

test("memorySpine: selector should prefer anchor matches and unresolved promises", () => {
  const nowHour = 30;
  const state = {
    v: 1 as const,
    entries: [
      {
        id: "p1",
        kind: "promise",
        scope: "npc_local",
        summary: "你答应N-008带回线索。",
        salience: 0.8,
        confidence: 0.9,
        status: "active",
        createdAtHour: 28,
        lastTouchedAtHour: 28,
        ttlHours: 72,
        mergeKey: "promise:N-008:clue",
        anchors: { npcIds: ["N-008"], locationIds: ["B1_SafeZone"], floorIds: ["B1"] },
        recallTags: ["promise"],
        source: "resolved_turn",
        promoteToLore: false,
      },
      {
        id: "x1",
        kind: "item_provenance",
        scope: "run_private",
        summary: "你获得了物品I-C12。",
        salience: 0.55,
        confidence: 0.9,
        status: "active",
        createdAtHour: 1,
        lastTouchedAtHour: 1,
        ttlHours: 24,
        mergeKey: "item:I-C12",
        anchors: { itemIds: ["I-C12"], floorIds: ["1"] },
        recallTags: ["award"],
        source: "resolved_turn",
        promoteToLore: false,
      },
    ],
  };
  const ctx = buildRecallContext({
    nowHour,
    playerLocation: "B1_SafeZone",
    presentNpcIds: ["N-008"],
    activeTaskIds: [],
    mainThreatByFloor: {},
    worldFlags: [],
    professionId: null,
  });
  const recalled = selectMemoryRecallPacket(state as any, ctx, { maxItems: 4 });
  assert.equal(recalled[0]!.entry.id, "p1");
});

test("memorySpine: recall block length should be strictly capped", () => {
  const recalled = Array.from({ length: 12 }).map((_, i) => ({
    entry: {
      id: `m${i}`,
      kind: "task_residue",
      scope: "run_private",
      summary: `测试记忆条目${i}：${"很长".repeat(40)}`,
      salience: 0.5,
      confidence: 0.8,
      status: "active",
      createdAtHour: 0,
      lastTouchedAtHour: 0,
      ttlHours: 72,
      mergeKey: `k${i}`,
      anchors: {},
      recallTags: [],
      source: "resolved_turn",
      promoteToLore: false,
    },
    score: 1,
  }));
  const block = buildMemoryRecallBlock({ recalled: recalled as any, maxChars: 300 });
  assert.equal(block.text.length <= 340, true); // include header/newlines
});


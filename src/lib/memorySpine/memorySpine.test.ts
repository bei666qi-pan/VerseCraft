import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyMemorySpine } from "@/lib/memorySpine/types";
import type { MemorySpineEntry } from "@/lib/memorySpine/types";
import { extractMemoryCandidates } from "@/lib/memorySpine/extract";
import { reduceMemoryCandidates } from "@/lib/memorySpine/reducer";
import { pruneMemorySpine } from "@/lib/memorySpine/prune";
import {
  buildRecallContext,
  selectChapterMustEchoEntries,
  selectChapterRecapMemoryEntries,
  selectMemoryRecallPacket,
  selectOpenChapterThreads,
} from "@/lib/memorySpine/selectors";
import { buildMemoryRecallBlock } from "@/lib/memorySpine/prompt";

function entry(overrides: Partial<MemorySpineEntry>): MemorySpineEntry {
  return {
    id: "m",
    kind: "hook",
    scope: "run_private",
    summary: "chapter memory",
    salience: 0.8,
    confidence: 0.9,
    status: "active",
    createdAtHour: 1,
    lastTouchedAtHour: 1,
    ttlHours: 72,
    mergeKey: "hook:m",
    anchors: {},
    recallTags: [],
    source: "system_hook",
    promoteToLore: false,
    ...overrides,
  };
}

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

test("memorySpine: extracted chapter-relevant memories bind to current chapter", () => {
  const candidates = extractMemoryCandidates({
    nowHour: 12,
    chapter: { chapterId: "chapter-2", chapterOrder: 2 },
    before: {
      playerLocation: "B1_SafeZone",
      activeTaskIds: ["task-a"],
      presentNpcIds: ["N-010"],
      mainThreatByFloor: {},
    },
    after: {
      playerLocation: "B1_SafeZone",
      tasks: [],
      codex: {},
      mainThreatByFloor: {},
    },
    resolvedTurn: {
      task_updates: [{ id: "task-a", status: "completed" }],
      relationship_updates: [{ npcId: "N-010", trust: 1 }],
      ui_hints: { consistency_flags: ["acquire_without_awards_downgraded"] },
    },
  });

  const chapterBound = candidates.filter((c) => c.kind === "promise" || c.kind === "relationship_shift" || c.kind === "hook");
  assert.equal(chapterBound.length >= 3, true);
  for (const c of chapterBound) {
    assert.equal(c.chapterId, "chapter-2");
    assert.equal(c.chapterOrder, 2);
    assert.ok(c.chapterRole);
  }
  assert.equal(chapterBound.some((c) => c.kind === "relationship_shift" && c.shouldAppearInRecap === true), true);
  assert.equal(chapterBound.some((c) => c.kind === "hook" && c.shouldAppearInRecap === true), true);
});

test("memorySpine: reducer and prune preserve chapter fields while accepting legacy entries", () => {
  const next = reduceMemoryCandidates({
    prev: {
      v: 1,
      entries: [
        entry({
          id: "legacy",
          mergeKey: "legacy:hook",
          chapterId: undefined,
          chapterOrder: undefined,
          chapterRole: undefined,
          shouldAppearInRecap: undefined,
        }),
      ],
    },
    nowHour: 4,
    candidates: [
      {
        kind: "relationship_shift",
        scope: "npc_local",
        summary: "N-010 relation shifted",
        salience: 0.7,
        confidence: 0.86,
        status: "active",
        ttlHours: 72,
        mergeKey: "rel:N-010",
        anchors: { npcIds: ["N-010"] },
        recallTags: ["rel_shift"],
        source: "relationship_update",
        chapterId: "chapter-3",
        chapterOrder: 3,
        chapterRole: "echo",
        shouldAppearInRecap: true,
        promoteToLore: false,
      },
      {
        kind: "relationship_shift",
        scope: "npc_local",
        summary: "N-010 relation shifted again",
        salience: 0.72,
        confidence: 0.9,
        status: "active",
        ttlHours: 72,
        mergeKey: "rel:N-010",
        anchors: { npcIds: ["N-010"], locationIds: ["B1_SafeZone"] },
        recallTags: ["rel_shift"],
        source: "relationship_update",
        chapterId: "chapter-3",
        chapterOrder: 3,
        chapterRole: "echo",
        shouldAppearInRecap: true,
        promoteToLore: false,
      },
    ],
  });
  const rel = next.entries.find((e) => e.mergeKey === "rel:N-010");
  assert.equal(rel?.chapterId, "chapter-3");
  assert.equal(rel?.chapterOrder, 3);
  assert.equal(rel?.chapterRole, "echo");
  assert.equal(rel?.shouldAppearInRecap, true);

  const pruned = pruneMemorySpine(next, 5, { maxEntries: 64 });
  const relAfterPrune = pruned.entries.find((e) => e.mergeKey === "rel:N-010");
  assert.equal(relAfterPrune?.chapterId, "chapter-3");
  assert.equal(pruned.entries.some((e) => e.id === "legacy"), true);
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

test("memorySpine: chapter selectors recap, echo, and thread entries with caps", () => {
  const state = {
    v: 1 as const,
    entries: [
      entry({ id: "rel1", kind: "relationship_shift", mergeKey: "rel:1", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "echo", shouldAppearInRecap: true, anchors: { npcIds: ["N-001"] } }),
      entry({ id: "rel2", kind: "relationship_shift", mergeKey: "rel:2", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "echo", shouldAppearInRecap: true, anchors: { npcIds: ["N-002"] } }),
      entry({ id: "rel3", kind: "relationship_shift", mergeKey: "rel:3", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "echo", shouldAppearInRecap: true, salience: 0.6, anchors: { npcIds: ["N-003"] } }),
      entry({ id: "hook1", kind: "hook", mergeKey: "hook:1", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "hook", shouldAppearInRecap: true }),
      entry({ id: "hook2", kind: "hook", mergeKey: "hook:2", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "hook", shouldAppearInRecap: true }),
      entry({ id: "hook3", kind: "hook", mergeKey: "hook:3", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "hook", shouldAppearInRecap: true, salience: 0.6 }),
      entry({ id: "micro", kind: "promise", mergeKey: "promise:micro", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "setup", shouldAppearInRecap: true, source: "resolved_turn", confidence: 0.58, salience: 0.58 }),
      entry({ id: "promise1", kind: "promise", mergeKey: "promise:1", chapterId: "chapter-4", chapterOrder: 4, chapterRole: "setup", shouldAppearInRecap: false, salience: 0.8 }),
      entry({ id: "other", kind: "hook", mergeKey: "hook:other", chapterId: "chapter-5", chapterOrder: 5, shouldAppearInRecap: true }),
    ],
  };

  const recap = selectChapterRecapMemoryEntries(state, { chapterId: "chapter-4", chapterOrder: 4, maxItems: 10 });
  assert.equal(recap.some((e) => e.id === "micro"), false);
  assert.equal(recap.some((e) => e.id === "other"), false);
  assert.equal(recap.filter((e) => e.kind === "relationship_shift").length, 2);
  assert.equal(recap.filter((e) => e.kind === "hook").length, 2);

  const mustEcho = selectChapterMustEchoEntries(state, { chapterId: "chapter-4", maxItems: 8 });
  assert.equal(mustEcho.some((e) => e.id === "promise1"), true);
  assert.equal(mustEcho.some((e) => e.id === "micro"), false);

  const openThreads = selectOpenChapterThreads(state, { chapterOrder: 4, maxItems: 12 });
  assert.equal(openThreads.some((e) => e.id === "promise1"), true);
  assert.equal(openThreads.some((e) => e.id === "other"), false);
});

test("memorySpine: recap selector keeps high-salience chapter entries and drops weak narrative micro patterns", () => {
  const state = {
    v: 1 as const,
    entries: [
      entry({
        id: "high_salience_micro",
        kind: "promise",
        mergeKey: "promise:high_salience_micro",
        chapterId: "chapter-6",
        chapterOrder: 6,
        chapterRole: "recap",
        shouldAppearInRecap: true,
        source: "resolved_turn",
        confidence: 0.6,
        salience: 0.88,
      }),
      entry({
        id: "weak_micro",
        kind: "promise",
        mergeKey: "promise:weak_micro",
        chapterId: "chapter-6",
        chapterOrder: 6,
        chapterRole: "recap",
        shouldAppearInRecap: true,
        source: "resolved_turn",
        confidence: 0.6,
        salience: 0.62,
      }),
      entry({
        id: "strong_hook",
        kind: "hook",
        mergeKey: "hook:strong",
        chapterId: "chapter-6",
        chapterOrder: 6,
        chapterRole: "hook",
        shouldAppearInRecap: true,
        confidence: 0.92,
        salience: 0.9,
      }),
    ],
  };

  const recap = selectChapterRecapMemoryEntries(state, {
    chapterId: "chapter-6",
    chapterOrder: 6,
    maxItems: 6,
  });

  assert.equal(recap.some((e) => e.id === "high_salience_micro"), true);
  assert.equal(recap.some((e) => e.id === "strong_hook"), true);
  assert.equal(recap.some((e) => e.id === "weak_micro"), false);
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


import test from "node:test";
import assert from "node:assert/strict";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import { groupCluesByPrimarySection, primaryJournalSection } from "./journalBoardUi";

const base = (over: Partial<ClueEntry>): ClueEntry => ({
  id: "c1",
  title: "t",
  detail: "d",
  kind: "rumor",
  status: "unknown",
  source: "dm",
  visibility: "shown",
  importance: 2,
  relatedNpcIds: [],
  relatedLocationIds: [],
  relatedItemIds: [],
  relatedObjectiveId: null,
  acquisitionSource: "dm",
  triggerSource: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

test("primaryJournalSection: stale when invalidated", () => {
  assert.equal(primaryJournalSection(base({ status: "invalidated" })), "stale");
});

test("primaryJournalSection: people when npc ids", () => {
  assert.equal(primaryJournalSection(base({ relatedNpcIds: ["N-001"] })), "people");
});

test("groupCluesByPrimarySection buckets", () => {
  const g = groupCluesByPrimarySection([
    base({ id: "a", relatedNpcIds: ["N-1"] }),
    base({ id: "b", relatedLocationIds: ["1F_Lobby"] }),
  ]);
  assert.equal(g.people.length, 1);
  assert.equal(g.place.length, 1);
});

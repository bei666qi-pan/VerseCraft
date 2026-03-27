import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultEscapeMainlineTemplate } from "./template";
import { normalizeEscapeMainline } from "./reducer";
import { buildEscapePromptBlock } from "./prompt";
import { advanceEscapeMainlineFromResolvedTurn } from "./integration";
import { shouldAllowDoomline } from "@/features/play/endgame/endgame";
import { computeEscapeOutcomeForSettlement } from "./selectors";

function makeMemory(kind: any, mergeKey: string, tags: string[] = []) {
  return {
    id: mergeKey,
    kind,
    scope: "run_private",
    summary: mergeKey,
    salience: 0.8,
    confidence: 0.9,
    status: "active",
    createdAtHour: 0,
    lastTouchedAtHour: 0,
    ttlHours: 48,
    mergeKey,
    anchors: {},
    recallTags: tags,
    source: "test",
    promoteToLore: false,
  };
}

test("phase5: old save missing escape mainline normalizes safely", () => {
  const s = normalizeEscapeMainline(undefined, 10);
  assert.equal(s.v, 1);
  assert.ok(typeof s.stage === "string");
  assert.ok(Array.isArray(s.knownConditions));
});

test("phase5: route fragments + conditions can advance to final_window_open", () => {
  const prev = createDefaultEscapeMainlineTemplate(0);
  const next = advanceEscapeMainlineFromResolvedTurn({
    prevEscapeRaw: prev,
    nowHour: 12,
    nowTurn: 9,
    playerLocation: "B2_GatekeeperDomain",
    tasks: [
      { id: "main_escape_cost_trial", status: "completed" } as any,
    ],
    codex: {
      "N-018": { trust: 55 },
    },
    inventoryItemIds: ["I-C12"],
    worldFlags: ["b2_access_granted"],
    memoryEntries: [makeMemory("route_hint", "map_piece_a"), makeMemory("route_hint", "map_piece_b")],
    resolvedTurn: {},
    changedBy: "test",
  });
  assert.equal(next.stage, "final_window_open");
  assert.equal(next.finalWindow.open, true);
  assert.ok(typeof next.pendingFinalAction === "string");
});

test("phase5: false lead is recorded but does not grant true escape", () => {
  const prev = createDefaultEscapeMainlineTemplate(0);
  const next = advanceEscapeMainlineFromResolvedTurn({
    prevEscapeRaw: prev,
    nowHour: 5,
    nowTurn: 3,
    playerLocation: "1F_Lobby",
    tasks: [],
    codex: {},
    inventoryItemIds: [],
    worldFlags: [],
    memoryEntries: [makeMemory("escape_condition", "fake_exit", ["false"])],
    resolvedTurn: {},
    changedBy: "test",
  });
  assert.ok(next.falseLeads.length >= 1);
  assert.notEqual(next.stage, "escaped_true");
});

test("phase5: prompt block is short and structured", () => {
  const s = createDefaultEscapeMainlineTemplate(0);
  const text = buildEscapePromptBlock({ state: s, maxChars: 200 });
  assert.ok(text.includes("出口主线"));
  assert.ok(text.length <= 200);
});

test("phase5: doomline should be suppressed after escaping", () => {
  assert.equal(shouldAllowDoomline({ escapeStage: "escaped_true" }), false);
  assert.equal(shouldAllowDoomline({ escapeStage: "escaped_costly" }), false);
  assert.equal(shouldAllowDoomline({ escapeStage: "trapped" }), true);
});

test("phase5: settlement outcome prefers structured escape outcome", () => {
  const s = normalizeEscapeMainline({ stage: "escaped_costly", outcomeHint: { outcome: "costly_escape" } }, 0);
  assert.equal(computeEscapeOutcomeForSettlement(s), "costly_escape");
});


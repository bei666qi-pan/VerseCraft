import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultEscapeMainlineTemplate } from "./template";
import { normalizeEscapeMainline } from "./reducer";
import { buildEscapePromptBlock } from "./prompt";
import { advanceEscapeMainlineFromResolvedTurn } from "./integration";
import { shouldAllowDoomline } from "@/features/play/endgame/endgame";
import { computeEscapeOutcomeForSettlement } from "./selectors";
import { deriveEscapeFactors } from "./derive";
import type { MemorySpineEntry, MemorySpineKind } from "@/lib/memorySpine/types";
import type { EscapeMainlineState } from "./types";

function makeMemory(kind: MemorySpineKind, mergeKey: string, tags: string[] = []): MemorySpineEntry {
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
    source: "system_hook",
    promoteToLore: false,
  };
}

function makeFinalWindowState(overrides: Partial<EscapeMainlineState> = {}): EscapeMainlineState {
  const base = createDefaultEscapeMainlineTemplate(0);
  return {
    ...base,
    stage: "final_window_open",
    routeFragments: [
      { code: "frag:map_piece_a", label: "map_piece_a", confidence: 0.7 },
      { code: "frag:map_piece_b", label: "map_piece_b", confidence: 0.7 },
    ],
    metConditions: ["obtain_b2_access", "secure_key_item", "gain_trust_from_gatekeeper", "survive_cost_trial"],
    blockers: [],
    pendingFinalAction: "perform_escape_action_at_gate",
    finalWindow: {
      open: true,
      dueTurn: 9,
      expiresTurn: 11,
      locationId: "B2_GatekeeperDomain",
      hint: "final window",
    },
    historyDigest: ["stage:conditions_partially_met->final_window_open"],
    ...overrides,
  };
}

function makeFinalActionArgs(
  overrides: Partial<Parameters<typeof advanceEscapeMainlineFromResolvedTurn>[0]> = {}
): Parameters<typeof advanceEscapeMainlineFromResolvedTurn>[0] {
  return {
    prevEscapeRaw: makeFinalWindowState(),
    nowHour: 12,
    nowTurn: 10,
    playerLocation: "B2_GatekeeperDomain",
    tasks: [{ id: "main_escape_cost_trial", status: "completed" } as any],
    codex: { "N-018": { trust: 55 } },
    inventoryItemIds: ["I-C12"],
    worldFlags: ["b2_access_granted"],
    memoryEntries: [makeMemory("route_hint", "map_piece_a"), makeMemory("route_hint", "map_piece_b")],
    resolvedTurn: {},
    playerAction: "\u63a8\u5f00\u771f\u6b63\u7684\u95e8\uff0c\u7a7f\u8fc7\u51fa\u53e3",
    changedBy: "test",
    ...overrides,
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

test("phase5: B2 presence alone does not grant B2 access", () => {
  const factors = deriveEscapeFactors({
    nowHour: 6,
    nowTurn: 3,
    playerLocation: "B2_Passage",
    tasks: [],
    codex: {},
    inventoryItemIds: ["I-C12"],
    worldFlags: [],
    memoryEntries: [makeMemory("route_hint", "map_piece_a"), makeMemory("route_hint", "map_piece_b")],
  });
  assert.ok(!factors.conditionMetCodes.includes("obtain_b2_access"));
  assert.ok(factors.blockers.some((b) => b.code === "illegal_b2_presence"));
  assert.equal(factors.pendingFinalAction, null);
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

test("phase6: final_window_open + complete conditions + true exit action resolves escaped_true", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(makeFinalActionArgs());
  assert.equal(next.stage, "escaped_true");
  assert.equal(next.outcomeHint.outcome, "true_escape");
  assert.equal(next.finalWindow.open, false);
});

test("phase6: final_window_open + complete conditions + costly final action resolves escaped_costly", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(
    makeFinalActionArgs({
      resolvedTurn: { escape_final_action: { kind: "costly_exit" } },
      playerAction: "",
    })
  );
  assert.equal(next.stage, "escaped_costly");
  assert.equal(next.outcomeHint.outcome, "costly_escape");
});

test("phase6: final_window_open + false exit action resolves escaped_false", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(
    makeFinalActionArgs({
      playerAction: "\u76f8\u4fe1\u955c\u4e2d\u51fa\u53e3",
    })
  );
  assert.equal(next.stage, "escaped_false");
  assert.equal(next.outcomeHint.outcome, "false_escape");
});

test("phase6: final_window_open + expired window resolves doomed", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(
    makeFinalActionArgs({
      nowTurn: 12,
    })
  );
  assert.equal(next.stage, "doomed");
  assert.equal(next.outcomeHint.outcome, "doom");
});

test("phase6: final_window_open + non-final action keeps final_window_open", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(
    makeFinalActionArgs({
      playerAction: "observe the gate",
    })
  );
  assert.equal(next.stage, "final_window_open");
  assert.ok(next.blockers.some((b) => b.code === "final_action_missing"));
});

test("phase6: B2 presence alone cannot resolve true escape", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(
    makeFinalActionArgs({
      prevEscapeRaw: makeFinalWindowState({ metConditions: [] }),
      playerLocation: "B2_Passage",
      worldFlags: [],
      resolvedTurn: { escape_final_action: "true_exit" },
      playerAction: "",
    })
  );
  assert.equal(next.stage, "final_window_open");
  assert.ok(next.blockers.some((b) => b.code === "unmet:obtain_b2_access"));
});

test("phase6: escaped stage is sticky and does not roll back on later final action calls", () => {
  const next = advanceEscapeMainlineFromResolvedTurn(
    makeFinalActionArgs({
      prevEscapeRaw: makeFinalWindowState({
        stage: "escaped_true",
        finalWindow: { open: false, dueTurn: 9, expiresTurn: 11, locationId: "B2_GatekeeperDomain", hint: "" },
        outcomeHint: { outcome: "true_escape", title: "true", toneLine: "" },
      }),
      resolvedTurn: { escape_final_action: "false_exit" },
      playerAction: "\u76f8\u4fe1\u955c\u4e2d\u51fa\u53e3",
    })
  );
  assert.equal(next.stage, "escaped_true");
  assert.equal(computeEscapeOutcomeForSettlement(next), "true_escape");
});

test("phase6: settlement outcome can be inferred from terminal escape stage", () => {
  assert.equal(computeEscapeOutcomeForSettlement(normalizeEscapeMainline({ stage: "escaped_true" }, 0)), "true_escape");
  assert.equal(computeEscapeOutcomeForSettlement(normalizeEscapeMainline({ stage: "escaped_costly" }, 0)), "costly_escape");
  assert.equal(computeEscapeOutcomeForSettlement(normalizeEscapeMainline({ stage: "escaped_false" }, 0)), "false_escape");
  assert.equal(computeEscapeOutcomeForSettlement(normalizeEscapeMainline({ stage: "doomed" }, 0)), "doom");
  assert.equal(computeEscapeOutcomeForSettlement(normalizeEscapeMainline({ stage: "final_window_open" }, 0)), "none");
});


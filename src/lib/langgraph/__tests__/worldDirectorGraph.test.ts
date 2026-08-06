// src/lib/langgraph/__tests__/worldDirectorGraph.test.ts
/**
 * Unit tests for World Director Graph topology and state management.
 *
 * Graph invocation tests require a Next.js server environment (DB connection,
 * server-only context). Those are covered by integration tests.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWorldDirectorGraph } from "../worldDirectorGraph";
import { createInitialState } from "../worldDirectorState";
import type { WorldEngineTickPayload } from "@/lib/worldEngine/contracts";

function makePayload(overrides: Partial<WorldEngineTickPayload> = {}): WorldEngineTickPayload {
  return {
    requestId: "test_req_1",
    userId: "user_1",
    sessionId: "session_1",
    latestUserInput: "我想去图书馆看看",
    triggerSignals: [],
    controlRiskTags: [],
    dmNarrativePreview: "你站在广场中央",
    playerLocation: "plaza",
    turnIndex: 3,
    dedupKey: "dedup_1",
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  } as WorldEngineTickPayload;
}

describe("World Director Graph — Topology", () => {
  it("builds a compiled graph with invoke method", () => {
    const graph = buildWorldDirectorGraph();
    assert.ok(graph !== undefined);
    assert.strictEqual(typeof graph.invoke, "function");
  });

  it("creates initial state with all default values", () => {
    const state = createInitialState(makePayload());

    assert.strictEqual(state.hasPlan, false);
    assert.strictEqual(state.planConfidence, "none");
    assert.strictEqual(state.status, "running");
    assert.strictEqual(state.reasonerRetries, 0);
    assert.deepStrictEqual(state.messages, []);
    assert.deepStrictEqual(state.recentFacts, []);
    assert.strictEqual(state.directorHintBlock, "");
    assert.strictEqual(state.errorStage, null);
  });

  it("initial state preserves payload fields", () => {
    const state = createInitialState(makePayload({
      sessionId: "my_session",
      turnIndex: 42,
    }));

    assert.strictEqual(state.payload.sessionId, "my_session");
    assert.strictEqual(state.payload.turnIndex, 42);
  });

  it("initial state has hasPlan=false and planConfidence=none", () => {
    const state = createInitialState(makePayload());
    assert.strictEqual(state.hasPlan, false);
    assert.strictEqual(state.planConfidence, "none");
  });

  it("graph can be compiled multiple times", () => {
    const g1 = buildWorldDirectorGraph();
    const g2 = buildWorldDirectorGraph();
    assert.ok(g1 !== undefined);
    assert.ok(g2 !== undefined);
    assert.strictEqual(typeof g1.invoke, "function");
    assert.strictEqual(typeof g2.invoke, "function");
  });
});

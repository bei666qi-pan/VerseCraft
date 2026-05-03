import assert from "node:assert/strict";
import test from "node:test";
import { runNarrativeTurn } from "./index";

test("runNarrativeTurn exposes a transitional shell without starting IO", async () => {
  const result = await runNarrativeTurn({
    requestId: "req_shell_1",
    sessionId: null,
    userId: null,
    latestUserInput: " look around ",
    messages: [{ role: "user", content: "look around" }],
    playerContext: "player snapshot",
    clientState: { ok: true },
  });

  assert.equal(result.status, 501);
  assert.deepEqual(result.narrativeRunSummary, {
    requestId: "req_shell_1",
    sessionId: null,
    userId: null,
    messageCount: 1,
    latestUserInputChars: 11,
    playerContextChars: 15,
    clientPurpose: null,
    phase: "transitional_shell",
    handledBy: "api_chat_route",
  });
});

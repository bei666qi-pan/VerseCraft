import assert from "node:assert/strict";
import test from "node:test";
import { VERSECRAFT_FINAL_PREFIX } from "@/lib/turnEngine/sse";
import { buildChatValidationFailureResponse, isEmptyChatInput } from "./chatValidationFailureResponse";

test("whitespace-only latest player input is identified before model execution", () => {
  assert.equal(isEmptyChatInput({ messages: [{ role: "user", content: "  \n\t " }] }), true);
  assert.equal(isEmptyChatInput({ messages: [{ role: "user", content: "（再次确认）" }] }), true);
  assert.equal(isEmptyChatInput({ messages: [{ role: "user", content: "环顾四周" }] }), false);
});

test("empty input validation failure remains an SSE rejection without consuming a turn", async () => {
  const response = buildChatValidationFailureResponse({
    validation: { ok: false, status: 400, error: "invalid message item" },
    requestId: "req-empty-input",
    isEmptyInput: true,
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);

  const body = await response.text();
  const finalLine = body
    .split("\n")
    .find((line) => line.startsWith(`data: ${VERSECRAFT_FINAL_PREFIX}`));
  assert.ok(finalLine);

  const dm = JSON.parse(finalLine.slice(`data: ${VERSECRAFT_FINAL_PREFIX}`.length)) as Record<string, unknown>;
  assert.equal(dm.is_action_legal, false);
  assert.equal(dm.is_death, false);
  assert.equal(dm.consumes_time, false);
  assert.deepEqual(dm.options, []);
  assert.match(String(dm.narrative), /输入|行动/);
  assert.equal((dm.internal_meta as Record<string, unknown>).action, "input_rejected");
});

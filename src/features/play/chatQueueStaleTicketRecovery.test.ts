import assert from "node:assert/strict";
import test from "node:test";
import { shouldRecoverStaleChatQueueTicket } from "./chatQueueStaleTicketRecovery";

test("retries a recognized stale ticket when the request actually carried a ticket", () => {
  assert.equal(
    shouldRecoverStaleChatQueueTicket({
      status: 409,
      reason: "invalid_ticket",
      hasQueueTicket: true,
      alreadyRetried: false,
    }),
    true
  );
  assert.equal(
    shouldRecoverStaleChatQueueTicket({
      status: 409,
      reason: "ticket_terminal",
      hasQueueTicket: true,
      alreadyRetried: false,
    }),
    true
  );
});

test("does not retry unrelated conflicts, ticketless actions, or an exhausted recovery", () => {
  for (const input of [
    { status: 409, reason: "identity_mismatch", hasQueueTicket: true, alreadyRetried: false },
    { status: 409, reason: "invalid_ticket", hasQueueTicket: false, alreadyRetried: false },
    { status: 409, reason: "invalid_ticket", hasQueueTicket: true, alreadyRetried: true },
    { status: 502, reason: "invalid_ticket", hasQueueTicket: true, alreadyRetried: false },
  ]) {
    assert.equal(shouldRecoverStaleChatQueueTicket(input), false);
  }
});

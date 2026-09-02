import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlayChatTransportTimeouts } from "./waitingConfig";

test("system talent turns do not reuse the normal first-chunk stall window", () => {
  const normal = resolvePlayChatTransportTimeouts(false);
  const talent = resolvePlayChatTransportTimeouts(true);

  assert.ok(talent.firstChunkStallMs > normal.firstChunkStallMs);
  assert.equal(talent.fetchDeadlineMs, normal.fetchDeadlineMs);
});

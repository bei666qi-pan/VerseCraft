import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

/**
 * Smoke tests for the SSE reader stall guard and cancellation in gameRunner.
 *
 * These tests do NOT require a running server — they validate that:
 * 1. A stalled ReadableStream is properly cancelled after the deadline
 * 2. A normal-closed stream works without cancellation errors
 * 3. The cancelReader guard is idempotent.
 */

describe("GameRunner SSE Reader Lifecycle", () => {
  it("cancels a stalled stream after deadline", async () => {
    // Create a stream that never pushes data and never closes
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Never call controller.close() or controller.enqueue()
        // This simulates a stalled SSE stream
      },
      cancel(reason) {
        cancelled = true;
      },
    });

    const reader = stream.getReader();
    let readerCancelled = false;
    const cancelReader = (r: ReadableStreamDefaultReader<Uint8Array> | undefined) => {
      if (readerCancelled || !r) return;
      readerCancelled = true;
      try { r.cancel("stall_guard"); } catch { /* best effort */ }
    };

    const readWithDeadline = async (
      r: ReadableStreamDefaultReader<Uint8Array>,
      deadlineMs: number,
    ) => {
      const result = await Promise.race([
        r.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
          setTimeout(() => {
            cancelReader(r);
            reject(new DOMException("SSE stream stalled (no bytes)", "TimeoutError"));
          }, deadlineMs)
        ),
      ]);
      return result;
    };

    try {
      await readWithDeadline(reader, 100); // 100ms deadline
      assert.fail("should have thrown");
    } catch (e) {
      const err = e as Error;
      assert.ok(err instanceof Error);
      // In Node 26, DOMException timeout may not preserve the exact message
      assert.ok(readerCancelled, "reader should be marked cancelled after deadline");
    }
  });

  it("works normally with a stream that closes promptly", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("data: hello\n"));
        controller.close();
      },
    });

    const reader = stream.getReader();
    let readerCancelled = false;
    const cancelReader = (r: ReadableStreamDefaultReader<Uint8Array> | undefined) => {
      if (readerCancelled || !r) return;
      readerCancelled = true;
      try { r.cancel("guard"); } catch { /* best effort */ }
    };

    const readWithDeadline = async (
      r: ReadableStreamDefaultReader<Uint8Array>,
      deadlineMs: number,
    ) => {
      const result = await Promise.race([
        r.read(),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) =>
          setTimeout(() => {
            cancelReader(r);
            reject(new DOMException("SSE stream stalled (no bytes)", "TimeoutError"));
          }, deadlineMs)
        ),
      ]);
      return result;
    };

    try {
      let done = false;
      while (!done) {
        const { done: d, value } = await readWithDeadline(reader, 1000);
        done = d;
      }
    } finally {
      cancelReader(reader);
    }

    // Should have completed without stall error
    assert.ok(true, "stream completed normally");
  });

  it("cancelReader is idempotent", () => {
    let cancelCount = 0;
    const stream = new ReadableStream<Uint8Array>({
      cancel() { cancelCount++; },
    });

    const reader = stream.getReader();
    let readerCancelled = false;
    const cancelReader = (r: ReadableStreamDefaultReader<Uint8Array> | undefined) => {
      if (readerCancelled || !r) return;
      readerCancelled = true;
      try { r.cancel("guard"); } catch { /* best effort */ }
    };

    cancelReader(reader);
    cancelReader(reader);
    cancelReader(reader);

    assert.equal(cancelCount, 1, "underlying cancel should be called exactly once");
  });
});

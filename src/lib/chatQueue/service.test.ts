import test from "node:test";
import assert from "node:assert/strict";
import type { ChatQueueConfig } from "./config";
import {
  cancelChatQueueTicket,
  completeChatQueueTicket,
  enqueueChatRequest,
  getChatQueueStatus,
  shouldQueueChatRequest,
  __resetChatQueueForTests,
} from "./service";
import { getChatQueueStore } from "./store";
import type { ChatQueueIdentity } from "./types";

async function withQueueEnv<T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await __resetChatQueueForTests();
  try {
    return await fn();
  } finally {
    await __resetChatQueueForTests();
    for (const key of Object.keys(patch)) {
      const old = prev[key];
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    }
  }
}

function identity(sessionId: string): ChatQueueIdentity {
  return {
    sessionId,
    userId: null,
    clientFingerprint: `fp-${sessionId}`,
  };
}

const BASE_ENV = {
  REDIS_URL: "",
  VC_CHAT_QUEUE_ENABLED: "1",
  VC_CHAT_QUEUE_MAX_RUNNING: "1",
  VC_CHAT_QUEUE_MAX_QUEUED: "5",
  VC_CHAT_QUEUE_ESTIMATED_SECONDS_PER_TURN: "12",
  VC_CHAT_QUEUE_STATUS_POLL_SECONDS: "2",
};

test("chat queue enqueues FIFO tickets with position and ETA", async () => {
  await withQueueEnv(BASE_ENV, async () => {
    const initialDecision = await shouldQueueChatRequest();
    assert.equal(initialDecision.shouldQueue, false);

    const first = await enqueueChatRequest({ requestId: "r1", identity: identity("s1") });
    assert.equal(first.ok, true);
    assert.equal(first.kind, "running");
    assert.equal(first.ticket?.status, "running");
    assert.equal(first.ticket?.position, 0);

    const peakDecision = await shouldQueueChatRequest();
    assert.equal(peakDecision.shouldQueue, true);
    assert.equal(peakDecision.runningCount, 1);

    const second = await enqueueChatRequest({ requestId: "r2", identity: identity("s2") });
    assert.equal(second.ok, true);
    assert.equal(second.kind, "queued");
    assert.equal(second.ticket?.position, 1);
    assert.equal(second.ticket?.etaSeconds, 12);

    const third = await enqueueChatRequest({ requestId: "r3", identity: identity("s3") });
    assert.equal(third.ok, true);
    assert.equal(third.kind, "queued");
    assert.equal(third.ticket?.position, 2);
    assert.equal(third.ticket?.etaSeconds, 24);
  });
});

test("chat queue reuses an existing active ticket for the same session", async () => {
  await withQueueEnv(BASE_ENV, async () => {
    const first = await enqueueChatRequest({ requestId: "r1", identity: identity("same") });
    const reused = await enqueueChatRequest({ requestId: "r2", identity: identity("same") });
    assert.equal(reused.ok, true);
    assert.equal(reused.kind, "reused");
    assert.equal(reused.ticket?.queueId, first.ticket?.queueId);
  });
});

test("chat queue rejects when queued capacity is full", async () => {
  await withQueueEnv({ ...BASE_ENV, VC_CHAT_QUEUE_MAX_QUEUED: "1" }, async () => {
    await enqueueChatRequest({ requestId: "r1", identity: identity("s1") });
    await enqueueChatRequest({ requestId: "r2", identity: identity("s2") });
    const third = await enqueueChatRequest({ requestId: "r3", identity: identity("s3") });
    assert.equal(third.ok, false);
    assert.equal(third.kind, "rejected");
    assert.equal(third.reason, "queue_full");
  });
});

test("chat queue cancel and complete release running slots and promote the next ticket", async () => {
  await withQueueEnv(BASE_ENV, async () => {
    const first = await enqueueChatRequest({ requestId: "r1", identity: identity("s1") });
    const second = await enqueueChatRequest({ requestId: "r2", identity: identity("s2") });
    assert.equal(second.ticket?.status, "queued");

    await cancelChatQueueTicket(first.ticket?.queueId ?? "");
    const promotedAfterCancel = await getChatQueueStatus(second.ticket?.queueId ?? "");
    assert.equal(promotedAfterCancel.ok, true);
    assert.equal(promotedAfterCancel.ok ? promotedAfterCancel.ticket.status : null, "running");

    const third = await enqueueChatRequest({ requestId: "r3", identity: identity("s3") });
    assert.equal(third.ticket?.status, "queued");
    await completeChatQueueTicket(second.ticket?.queueId ?? "");
    const promotedAfterComplete = await getChatQueueStatus(third.ticket?.queueId ?? "");
    assert.equal(promotedAfterComplete.ok, true);
    assert.equal(promotedAfterComplete.ok ? promotedAfterComplete.ticket.status : null, "running");
  });
});

test("chat queue expires stale active tickets and releases identity locks", async () => {
  await withQueueEnv({ ...BASE_ENV, VC_CHAT_QUEUE_MAX_QUEUED: "2" }, async () => {
    const config: ChatQueueConfig = {
      enabled: true,
      maxRunning: 1,
      maxQueued: 2,
      estimatedSecondsPerTurn: 9,
      ticketTtlSeconds: 1,
      statusPollSeconds: 1,
      redisPrefix: "vc:test_chat_queue",
    };
    const store = getChatQueueStore();
    const first = await store.enqueue({
      requestId: "r1",
      identity: identity("s1"),
      reason: "peak",
      config,
      now: 0,
    });
    assert.notEqual(first.kind, "rejected");
    const queueId = first.kind === "rejected" ? "" : first.ticket.queueId;

    const expired = await store.getStatus(queueId, config, 1_500);
    assert.equal(expired?.status, "expired");

    const replacement = await store.enqueue({
      requestId: "r2",
      identity: identity("s1"),
      reason: "peak",
      config,
      now: 2_000,
    });
    assert.notEqual(replacement.kind, "rejected");
    assert.notEqual(replacement.kind === "rejected" ? "" : replacement.ticket.queueId, queueId);
  });
});

test("chat queue falls back to memory when Redis is unavailable", async () => {
  await withQueueEnv({ ...BASE_ENV, REDIS_URL: "redis://127.0.0.1:1" }, async () => {
    const ticket = await enqueueChatRequest({ requestId: "r1", identity: identity("s1") });
    assert.equal(ticket.ok, true);
    assert.equal(ticket.kind, "running");
    assert.ok(ticket.ticket?.queueId);
  });
});

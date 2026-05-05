import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { __resetChatQueueForTests } from "@/lib/chatQueue/service";

type QueueRouteHandlers = {
  enqueueQueue: (req: Request) => Promise<Response>;
  queueStatus: (req: Request) => Promise<Response>;
  cancelQueue: (req: Request) => Promise<Response>;
};

let routeHandlers: Promise<QueueRouteHandlers> | null = null;

function allowServerOnlyMarkerInNodeTests() {
  const moduleWithLoad = Module as unknown as {
    _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
  };
  const originalLoad = moduleWithLoad._load;
  if ((moduleWithLoad as unknown as { __vcServerOnlyPatched?: boolean }).__vcServerOnlyPatched) return;
  moduleWithLoad._load = function patchedLoad(request: string, parent?: unknown, isMain?: boolean) {
    if (request === "server-only") return {};
    return originalLoad.apply(this, [request, parent, isMain]);
  } as typeof originalLoad;
  (moduleWithLoad as unknown as { __vcServerOnlyPatched?: boolean }).__vcServerOnlyPatched = true;
}

async function loadRoutes(): Promise<QueueRouteHandlers> {
  allowServerOnlyMarkerInNodeTests();
  routeHandlers ??= Promise.all([
    import("./route"),
    import("./status/route"),
    import("./cancel/route"),
  ]).then(([enqueue, status, cancel]) => ({
    enqueueQueue: enqueue.POST,
    queueStatus: status.GET,
    cancelQueue: cancel.POST,
  }));
  return routeHandlers;
}

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

const BASE_ENV = {
  DATABASE_URL: "postgres://versecraft:versecraft@127.0.0.1:5432/versecraft_test",
  AUTH_SECRET: "chat-queue-contract-test-secret-32chars",
  REDIS_URL: "",
  VC_CHAT_QUEUE_ENABLED: "1",
  VC_CHAT_QUEUE_MAX_RUNNING: "1",
  VC_CHAT_QUEUE_MAX_QUEUED: "5",
  VC_CHAT_QUEUE_ESTIMATED_SECONDS_PER_TURN: "12",
  VC_CHAT_QUEUE_STATUS_POLL_SECONDS: "2",
};

function chatBody(sessionId: string, extra?: Record<string, unknown>) {
  return {
    messages: [{ role: "user", content: "查看门后的动静" }],
    playerContext: "测试玩家位于暗月公寓走廊。",
    sessionId,
    clientState: {
      v: 1,
      turnIndex: 1,
      playerLocation: "暗月公寓走廊",
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
    },
    openingOptionsOnlyRound: false,
    ...extra,
  };
}

function queueRequest(body: unknown, ip: string, requestId: string): Request {
  return new Request("http://127.0.0.1/api/chat/queue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": "chat-queue-contract-test",
      "x-versecraft-request-id": requestId,
      "x-versecraft-client-fingerprint": `fp-${requestId}`,
    },
    body: JSON.stringify(body),
  });
}

test("POST /api/chat/queue and status/cancel expose queue ticket contract", async () => {
  await withQueueEnv(BASE_ENV, async () => {
    const { enqueueQueue, queueStatus, cancelQueue } = await loadRoutes();
    const first = await enqueueQueue(queueRequest(chatBody("qs1"), "203.0.113.11", "rq-queue-1"));
    assert.equal(first.status, 200);
    const firstPayload = await first.json();
    assert.equal(firstPayload.status, "running");
    assert.equal(firstPayload.position, 0);
    assert.ok(firstPayload.queueId);

    const second = await enqueueQueue(queueRequest(chatBody("qs2"), "203.0.113.12", "rq-queue-2"));
    assert.equal(second.status, 202);
    assert.equal(second.headers.get("retry-after"), "2");
    const secondPayload = await second.json();
    assert.equal(secondPayload.status, "queued");
    assert.equal(secondPayload.position, 1);
    assert.equal(secondPayload.etaSeconds, 12);

    const status = await queueStatus(
      new Request(`http://127.0.0.1/api/chat/queue/status?queueId=${secondPayload.queueId}`)
    );
    assert.equal(status.status, 200);
    const statusPayload = await status.json();
    assert.equal(statusPayload.status, "queued");
    assert.equal(statusPayload.position, 1);

    const cancelled = await cancelQueue(
      new Request("http://127.0.0.1/api/chat/queue/cancel", {
        method: "POST",
        body: JSON.stringify({ queueId: secondPayload.queueId }),
      })
    );
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).status, "cancelled");
  });
});

test("POST /api/chat/queue returns Retry-After when queue capacity is full", async () => {
  await withQueueEnv({ ...BASE_ENV, VC_CHAT_QUEUE_MAX_QUEUED: "1" }, async () => {
    const { enqueueQueue } = await loadRoutes();
    await enqueueQueue(queueRequest(chatBody("qf1"), "203.0.113.21", "rq-full-1"));
    await enqueueQueue(queueRequest(chatBody("qf2"), "203.0.113.22", "rq-full-2"));
    const full = await enqueueQueue(queueRequest(chatBody("qf3"), "203.0.113.23", "rq-full-3"));
    assert.equal(full.status, 429);
    assert.ok(full.headers.get("retry-after"));
    const payload = await full.json();
    assert.equal(payload.status, "rejected");
    assert.equal(payload.reason, "queue_full");
  });
});

test("POST /api/chat/queue skips options_regen_only requests", async () => {
  await withQueueEnv(BASE_ENV, async () => {
    const { enqueueQueue } = await loadRoutes();
    const res = await enqueueQueue(
      queueRequest(
        chatBody("qo1", {
          clientPurpose: "options_regen_only",
          clientReason: "manual_button",
          optionsRegenContext: {
            latestPlayerAction: "查看门后",
            latestNarrativeExcerpt: "走廊很安静。",
            currentOptions: [],
            recentOptions: [],
            activeTaskSummaries: [],
          },
        }),
        "203.0.113.31",
        "rq-options-only"
      )
    );
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.disabled, true);
    assert.equal(payload.skipped, "options_regen_only");
    assert.equal(payload.queueId, null);
  });
});

test("POST /api/chat/queue risk-control rejection does not enqueue", async () => {
  await withQueueEnv({ ...BASE_ENV, VC_CHAT_QUEUE_MAX_RUNNING: "100" }, async () => {
    const { enqueueQueue } = await loadRoutes();
    let blocked: Response | null = null;
    for (let i = 0; i < 35; i += 1) {
      const res = await enqueueQueue(
        queueRequest(chatBody(`risk-${i}`), "203.0.113.250", `rq-risk-${i}`)
      );
      if (res.status === 429) {
        blocked = res;
        break;
      }
    }
    assert.ok(blocked, "expected risk control to reject repeated queue submissions");
    assert.ok(blocked?.headers.get("retry-after"));
    const payload = await blocked!.json();
    assert.equal(payload.status, "rejected");
    assert.equal(payload.error, "risk_control");
  });
});

test("POST /api/chat/queue uses memory fallback when Redis is unavailable", async () => {
  await withQueueEnv({ ...BASE_ENV, REDIS_URL: "redis://127.0.0.1:1" }, async () => {
    const { enqueueQueue } = await loadRoutes();
    const res = await enqueueQueue(queueRequest(chatBody("redis-off"), "203.0.113.41", "rq-redis-off"));
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.status, "running");
    assert.ok(payload.queueId);
  });
});

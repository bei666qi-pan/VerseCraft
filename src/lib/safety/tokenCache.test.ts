import test from "node:test";
import assert from "node:assert/strict";
import { createSingleFlightTokenCache } from "@/lib/safety/tokenCache";

test("single-flight: concurrent getToken triggers only one fetch", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return {
      token: `token_${calls}`,
      obtainedAtMs: Date.now(),
      expiresAtMs: Date.now() + 10_000,
    };
  };

  const cache = createSingleFlightTokenCache(fetcher, { key: "t1", refreshWindowMs: 1_000 });

  const results = await Promise.all(Array.from({ length: 10 }).map(() => cache.getToken()));
  assert.equal(calls, 1);
  assert.equal(new Set(results).size, 1);
});

test("refresh window: expired-within-window token triggers refresh", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return {
      token: `token_${calls}`,
      obtainedAtMs: Date.now(),
      expiresAtMs: Date.now() + 500, // likely invalid against refreshWindowMs
    };
  };

  const cache = createSingleFlightTokenCache(fetcher, { key: "t2", refreshWindowMs: 1_000 });

  const first = await cache.getToken();
  const second = await cache.getToken();
  assert.notEqual(first, second);
  assert.equal(calls, 2);
});

test("valid token: sequential getToken reuses cached value", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return {
      token: `token_${calls}`,
      obtainedAtMs: Date.now(),
      expiresAtMs: Date.now() + 10_000,
    };
  };

  const cache = createSingleFlightTokenCache(fetcher, { key: "t3", refreshWindowMs: 1_000 });

  const first = await cache.getToken();
  const second = await cache.getToken();
  assert.equal(first, second);
  assert.equal(calls, 1);
});


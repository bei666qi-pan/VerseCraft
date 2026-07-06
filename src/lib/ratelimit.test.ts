import test from "node:test";
import assert from "node:assert/strict";
import { __resetRatelimitForTests, getAppRedisClient } from "@/lib/ratelimit";

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    const v = patch[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(patch)) {
      const old = prev[k];
      if (old === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = old;
      }
    }
  }
}

test("getAppRedisClient disables Redis when REDIS_URL is empty", async () => {
  await __resetRatelimitForTests();
  await withEnv({ REDIS_URL: "" }, async () => {
    assert.equal(await getAppRedisClient(), null);
  });
  await __resetRatelimitForTests();
});

test("getAppRedisClient downgrades connection refusal without repeated error logs", async () => {
  await __resetRatelimitForTests();
  const warnings: string[] = [];
  const errors: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  };

  try {
    await withEnv({ REDIS_URL: "redis://127.0.0.1:1" }, async () => {
      assert.equal(await getAppRedisClient(), null);
      assert.equal(await getAppRedisClient(), null);
    });
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    await __resetRatelimitForTests();
  }

  // 只过滤 ratelimit 自身的日志，不对 errors.length 做全量零断言：Node 自身的
  // 一次性 deprecation warning（如 module.register() 已弃用）也会经由某些路径
  // 触达全局 console.error，与本模块降级行为无关，在单独跑本文件时曾偶发误判失败
  // （2026-07 排查确认，见项目记忆/对话记录）。
  assert.equal(errors.filter((msg) => msg.includes("[ratelimit]")).length, 0);
  assert.equal(warnings.filter((msg) => msg.includes("Redis unavailable")).length, 1);
});

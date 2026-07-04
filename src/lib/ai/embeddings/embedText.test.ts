import { test } from "node:test";
import assert from "node:assert/strict";
import { embedText } from "./embedText";

// 本文件运行环境（沙箱/CI）没有真实的 AI_GATEWAY_BASE_URL / AI_MODEL_EMBEDDING /
// AI_GATEWAY_API_KEY，因此以下用例覆盖的是：(a) 未配置时优雅返回 not_configured，
// (b) mock provider（AI_GATEWAY_PROVIDER=mock）路径。真实火山引擎 Ark 网络请求路径
// （fetch 成功/HTTP 错误/维度不匹配分支）无法在当前环境验证，需要用户在有真实凭证的
// 环境里跑一次 `pnpm embeddings:backfill:once --dry-run` 或等价探测。

test("embedText：未配置任何 embeddings 相关环境变量时返回 not_configured，不抛异常", async () => {
  const prevProvider = process.env.AI_GATEWAY_PROVIDER;
  const prevModel = process.env.AI_MODEL_EMBEDDING;
  const prevKey = process.env.AI_GATEWAY_API_KEY;
  const prevBase = process.env.AI_GATEWAY_BASE_URL;
  delete process.env.AI_GATEWAY_PROVIDER;
  delete process.env.AI_MODEL_EMBEDDING;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_BASE_URL;
  try {
    const result = await embedText("测试文本");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_configured");
  } finally {
    if (prevProvider !== undefined) process.env.AI_GATEWAY_PROVIDER = prevProvider;
    if (prevModel !== undefined) process.env.AI_MODEL_EMBEDDING = prevModel;
    if (prevKey !== undefined) process.env.AI_GATEWAY_API_KEY = prevKey;
    if (prevBase !== undefined) process.env.AI_GATEWAY_BASE_URL = prevBase;
  }
});

test("embedText：mock provider 返回确定性向量，维度符合 AI_EMBEDDING_DIMENSION", async () => {
  const prevProvider = process.env.AI_GATEWAY_PROVIDER;
  const prevDim = process.env.AI_EMBEDDING_DIMENSION;
  process.env.AI_GATEWAY_PROVIDER = "mock";
  process.env.AI_EMBEDDING_DIMENSION = "16";
  try {
    const result = await embedText("同一段文本");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.vector.length, 16);
      assert.ok(result.vector.every((v) => Number.isFinite(v)));
    }
  } finally {
    if (prevProvider !== undefined) process.env.AI_GATEWAY_PROVIDER = prevProvider;
    else delete process.env.AI_GATEWAY_PROVIDER;
    if (prevDim !== undefined) process.env.AI_EMBEDDING_DIMENSION = prevDim;
    else delete process.env.AI_EMBEDDING_DIMENSION;
  }
});

test("embedText：mock provider 对相同输入返回相同向量（确定性，便于测试可重复）", async () => {
  const prevProvider = process.env.AI_GATEWAY_PROVIDER;
  process.env.AI_GATEWAY_PROVIDER = "mock";
  try {
    const a = await embedText("重复输入文本");
    const b = await embedText("重复输入文本");
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (a.ok && b.ok) assert.deepEqual(a.vector, b.vector);
  } finally {
    if (prevProvider !== undefined) process.env.AI_GATEWAY_PROVIDER = prevProvider;
    else delete process.env.AI_GATEWAY_PROVIDER;
  }
});

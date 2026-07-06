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

// ark_multimodal 分支（envCore.ts 的架构例外：直连火山方舟多模态向量化）用 stub fetch 覆盖，
// 不需要真实凭证——验证请求体形状（input 数组 + dimensions）和响应解析（data 为单对象而非数组，
// 已用真实凭证探测确认这是 Ark 多模态向量化的真实响应形态）。
test("embedText：ark_multimodal provider 发送 input 数组请求体，正确解析 data.embedding 单对象响应", async () => {
  const prevFetch = globalThis.fetch;
  const prevEnv = {
    AI_GATEWAY_PROVIDER: process.env.AI_GATEWAY_PROVIDER,
    AI_EMBEDDING_PROVIDER: process.env.AI_EMBEDDING_PROVIDER,
    ARK_EMBEDDING_BASE_URL: process.env.ARK_EMBEDDING_BASE_URL,
    ARK_EMBEDDING_API_KEY: process.env.ARK_EMBEDDING_API_KEY,
    AI_MODEL_EMBEDDING: process.env.AI_MODEL_EMBEDDING,
    AI_EMBEDDING_DIMENSION: process.env.AI_EMBEDDING_DIMENSION,
  };
  delete process.env.AI_GATEWAY_PROVIDER;
  process.env.AI_EMBEDDING_PROVIDER = "ark_multimodal";
  process.env.ARK_EMBEDDING_BASE_URL = "https://ark.example.test";
  process.env.ARK_EMBEDDING_API_KEY = "test-ark-key";
  process.env.AI_MODEL_EMBEDDING = "ep-test-endpoint";
  process.env.AI_EMBEDDING_DIMENSION = "4";

  let capturedUrl = "";
  let capturedBody: unknown = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body));
    return {
      ok: true,
      json: async () => ({ data: { embedding: [0.1, 0.2, 0.3, 0.4] } }),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await embedText("测试文本");
    assert.equal(capturedUrl, "https://ark.example.test/api/v3/embeddings/multimodal");
    assert.deepEqual(capturedBody, {
      model: "ep-test-endpoint",
      input: [{ type: "text", text: "测试文本" }],
      dimensions: 4,
      encoding_format: "float",
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.vector, [0.1, 0.2, 0.3, 0.4]);
  } finally {
    globalThis.fetch = prevFetch;
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }
  }
});

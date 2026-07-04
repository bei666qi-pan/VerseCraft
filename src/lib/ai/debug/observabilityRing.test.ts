import { test } from "node:test";
import assert from "node:assert/strict";
import { pushAiObservability, listRecentAiObservability } from "./observabilityRing";

// 本文件运行环境（沙箱/CI）未配置 REDIS_URL，getAppRedisClient() 会同步返回 null，
// 因此以下用例实际验证的是"Redis 不可用时优雅降级为内存 ring"这条路径——
// 这也正是本次改造要求的向后兼容基线：任何环境下都不能比改造前更差。

test("pushAiObservability + listRecentAiObservability：往返读写，最新一条排在最前", async () => {
  const marker = `probe-basic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pushAiObservability({ requestId: marker, task: "PLAYER_CHAT", phase: "final" });
  const rows = await listRecentAiObservability();
  assert.equal(rows[0]?.requestId, marker);
  assert.equal(rows[0]?.phase, "final");
});

test("userIdHash：从 userId 派生稳定的 12 位十六进制 hash，且不会把原始 userId 写入任何字段", async () => {
  const marker = `probe-hash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rawUserId = "user-super-secret-12345";
  pushAiObservability({ requestId: marker, task: "PLAYER_CHAT", phase: "final", userId: rawUserId });
  const rows = await listRecentAiObservability();
  const row = rows.find((r) => r.requestId === marker);
  assert.ok(row, "应能找到刚写入的记录");
  assert.match(row!.userIdHash ?? "", /^[0-9a-f]{12}$/);
  assert.ok(!JSON.stringify(row).includes(rawUserId), "序列化结果不应包含原始 userId");
});

test("userIdHash：相同 userId 两次调用得到相同 hash（确定性）", async () => {
  const rawUserId = "user-determinism-check";
  const markerA = `probe-det-a-${Date.now()}`;
  const markerB = `probe-det-b-${Date.now()}`;
  pushAiObservability({ requestId: markerA, task: "PLAYER_CHAT", phase: "final", userId: rawUserId });
  pushAiObservability({ requestId: markerB, task: "PLAYER_CHAT", phase: "final", userId: rawUserId });
  const rows = await listRecentAiObservability();
  const rowA = rows.find((r) => r.requestId === markerA);
  const rowB = rows.find((r) => r.requestId === markerB);
  assert.equal(rowA?.userIdHash, rowB?.userIdHash);
});

test("userId 缺失时 userIdHash 为 undefined", async () => {
  const marker = `probe-nouser-${Date.now()}`;
  pushAiObservability({ requestId: marker, task: "PLAYER_CHAT", phase: "final" });
  const rows = await listRecentAiObservability();
  const row = rows.find((r) => r.requestId === marker);
  assert.equal(row?.userIdHash, undefined);
});

test("容量上限 120 + FIFO 淘汰：连续写入 130 条后只保留最近 120 条，最早的条目被完全淘汰", async () => {
  const prefix = `probe-fifo-${Date.now()}`;
  for (let i = 0; i < 130; i++) {
    pushAiObservability({ requestId: `${prefix}-${i}`, task: "PLAYER_CHAT", phase: "final" });
  }
  const rows = await listRecentAiObservability();
  assert.equal(rows.length, 120, "ring 容量应恒为 120");
  // 最后写入的（i=129）应在最前面
  assert.equal(rows[0]?.requestId, `${prefix}-129`);
  // 最早的 10 条（i=0..9）应已被完全淘汰
  for (let i = 0; i < 10; i++) {
    assert.ok(
      !rows.some((r) => r.requestId === `${prefix}-${i}`),
      `第 ${i} 条应已被淘汰`
    );
  }
  // 最近 120 条（i=10..129）应全部还在
  for (let i = 10; i < 130; i++) {
    assert.ok(
      rows.some((r) => r.requestId === `${prefix}-${i}`),
      `第 ${i} 条应仍保留在 ring 内`
    );
  }
});

test("pushAiObservability 是同步、非阻塞的（不返回 Promise，调用后立即可读）", () => {
  const marker = `probe-sync-${Date.now()}`;
  const returnValue = pushAiObservability({ requestId: marker, task: "PLAYER_CHAT", phase: "final" });
  assert.equal(returnValue, undefined, "pushAiObservability 应为同步 void 函数，不强迫调用方 await");
});

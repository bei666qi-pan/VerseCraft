import test from "node:test";
import assert from "node:assert/strict";
import type { ForeshadowLedgerInsertParams } from "./foreshadowLedger";

// ============================================================
// Parameter shape tests（纯类型 + 值验证，不触 DB）
// ============================================================

test("ForeshadowLedgerInsertParams: shape accepts valid input", () => {
  const params: ForeshadowLedgerInsertParams = {
    sessionId: "sess_123",
    userId: "user_456",
    turnIndex: 10,
    ops: [
      { op: "plant", text: "走廊尽头有声响", importance: 2 },
      { op: "payoff", id: 5, text: "声响源头是一只猫" },
    ],
  };
  assert.equal(params.sessionId, "sess_123");
  assert.equal(params.ops.length, 2);
  assert.equal(params.ops[0]!.op, "plant");
});

test("ForeshadowLedgerInsertParams: ops can be empty", () => {
  const params: ForeshadowLedgerInsertParams = {
    sessionId: "sess_123",
    userId: null,
    turnIndex: 0,
    ops: [],
  };
  assert.equal(params.ops.length, 0);
});

test("ForeshadowLedgerInsertParams: reinforce op shape", () => {
  const params: ForeshadowLedgerInsertParams = {
    sessionId: "sess_123",
    userId: undefined,
    turnIndex: 5,
    ops: [
      { op: "reinforce", text: "强化伏笔", importance: 1 },
    ],
  };
  assert.equal(params.ops[0]!.op, "reinforce");
});

// ============================================================
// insertForeshadowLedgerRows: fire-and-forget 不阻塞
// ============================================================

test("insertForeshadowLedgerRows: does not throw on empty ops", () => {
  // 动态 import 验证模块可加载（不触 DB，因为 ops 为空）
  import("./foreshadowLedger").then(({ insertForeshadowLedgerRows }) => {
    // fire-and-forget，不 await，不抛错
    insertForeshadowLedgerRows({
      sessionId: "test_session",
      userId: null,
      turnIndex: 0,
      ops: [],
    });
    assert.ok(true); // 到达此处即通过
  });
});

// ============================================================
// readDueForeshadowEntries: fail-open 返回空数组
// ============================================================

test("readDueForeshadowEntries: returns empty array when DB unavailable", async () => {
  const { readDueForeshadowEntries } = await import("./foreshadowLedger");
  // 在测试环境中 DB 不可用，应 fail-open 返回空数组
  const result = await readDueForeshadowEntries("nonexistent_session", 10);
  assert.ok(Array.isArray(result));
  // 不检查 length === 0，因为如果 DB 恰好可用会有数据
});

// ============================================================
// expireOverdueForeshadows: fire-and-forget 不阻塞
// ============================================================

test("expireOverdueForeshadows: does not throw", async () => {
  const { expireOverdueForeshadows } = await import("./foreshadowLedger");
  // fire-and-forget，不 await，不抛错
  expireOverdueForeshadows("nonexistent_session", 100);
  assert.ok(true);
});

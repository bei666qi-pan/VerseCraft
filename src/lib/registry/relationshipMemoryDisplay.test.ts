import { test } from "node:test";
import assert from "node:assert/strict";
import type { MemorySpineEntry, MemorySpineState } from "@/lib/memorySpine/types";
import {
  selectNpcMemoryMoments,
  formatNpcMemoryMomentLine,
  buildNpcMemoryMomentLines,
} from "./relationshipMemoryDisplay";

function entry(overrides: Partial<MemorySpineEntry> & Pick<MemorySpineEntry, "id" | "kind" | "summary">): MemorySpineEntry {
  return {
    scope: "npc_local",
    salience: 0.6,
    confidence: 0.8,
    status: "active",
    createdAtHour: 10,
    lastTouchedAtHour: 10,
    ttlHours: 72,
    mergeKey: overrides.id,
    anchors: {},
    recallTags: [],
    source: "relationship_update",
    promoteToLore: false,
    ...overrides,
  };
}

function spine(entries: MemorySpineEntry[]): MemorySpineState {
  return { v: 1, entries };
}

test("selectNpcMemoryMoments：只挑与该 npcId 相关、状态非 expired 的记忆", () => {
  const s = spine([
    entry({ id: "a", kind: "relationship_shift", summary: "你与欣蓝的关系有了新变化——看起来更信任你了。", anchors: { npcIds: ["N-010"] } }),
    entry({ id: "b", kind: "relationship_shift", summary: "你与麟泽的关系有了新变化——似乎对你冷淡了几分。", anchors: { npcIds: ["N-020"] } }),
    entry({ id: "c", kind: "relationship_shift", summary: "已过期的记忆。", status: "expired", anchors: { npcIds: ["N-010"] } }),
  ]);
  const out = selectNpcMemoryMoments(s, "N-010");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "a");
});

test("selectNpcMemoryMoments：只挑关系相关 kind，世界事件类（如 route_hint）不出现", () => {
  const s = spine([
    entry({ id: "a", kind: "route_hint", summary: "你已抵达某处。", anchors: { npcIds: ["N-010"] } }),
    entry({ id: "b", kind: "relationship_shift", summary: "你与欣蓝的关系有了新变化——看起来更信任你了。", anchors: { npcIds: ["N-010"] } }),
  ]);
  const out = selectNpcMemoryMoments(s, "N-010");
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "relationship_shift");
});

test("selectNpcMemoryMoments：防御性拒绝看起来像未清洗内部标识的文本", () => {
  const s = spine([
    entry({ id: "a", kind: "relationship_shift", summary: "你与N-010的关系发生变化（trust+2）。", anchors: { npcIds: ["N-010"] } }),
    entry({ id: "b", kind: "relationship_shift", summary: "你在1F_PropertyOffice与他有过交集。", anchors: { npcIds: ["N-010"] } }),
  ]);
  const out = selectNpcMemoryMoments(s, "N-010");
  assert.equal(out.length, 0, "两条都应被防御性过滤掉");
});

test("selectNpcMemoryMoments：按最近优先排序，并按 mergeKey 去重（保留较新一条）", () => {
  const s = spine([
    entry({ id: "old", kind: "relationship_shift", summary: "你与欣蓝的关系有了新变化——似乎对你冷淡了几分。", mergeKey: "rel:N-010", createdAtHour: 5, anchors: { npcIds: ["N-010"] } }),
    entry({ id: "new", kind: "relationship_shift", summary: "你与欣蓝的关系有了新变化——看起来更信任你了。", mergeKey: "rel:N-010", createdAtHour: 20, anchors: { npcIds: ["N-010"] } }),
  ]);
  const out = selectNpcMemoryMoments(s, "N-010");
  assert.equal(out.length, 1, "同 mergeKey 只保留一条");
  assert.equal(out[0].id, "new");
});

test("selectNpcMemoryMoments：maxItems 生效，裁剪到 [1,6]", () => {
  const entries = Array.from({ length: 10 }, (_, i) =>
    entry({
      id: `m${i}`,
      kind: "relationship_shift",
      summary: `你与欣蓝的关系有了新变化——第${i}次印象。`.replace(/\d/g, ""), // 避免命中数字类内部标识误判
      mergeKey: `rel:N-010:${i}`,
      createdAtHour: i,
      anchors: { npcIds: ["N-010"] },
    })
  );
  const s = spine(entries);
  assert.equal(selectNpcMemoryMoments(s, "N-010", { maxItems: 2 }).length, 2);
  assert.equal(selectNpcMemoryMoments(s, "N-010", { maxItems: 999 }).length, 6, "应裁剪到上限 6");
});

test("selectNpcMemoryMoments：memorySpine 缺失或 npcId 为空时返回空数组，不抛错", () => {
  assert.deepEqual(selectNpcMemoryMoments(null, "N-010"), []);
  assert.deepEqual(selectNpcMemoryMoments(spine([]), ""), []);
});

test("formatNpcMemoryMomentLine：清洗开发者语气片段并裁剪长度", () => {
  const e = entry({ id: "a", kind: "relationship_shift", summary: "  这是一句很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的记忆描述文本用于测试裁剪  " });
  const line = formatNpcMemoryMomentLine(e, 20);
  assert.ok(line.length <= 21, `裁剪后长度应 <= 21（含省略号），实际长度 ${line.length}`);
  assert.ok(line.endsWith("…"));
});

test("buildNpcMemoryMomentLines：组合选取+格式化，得到可直接渲染的字符串数组", () => {
  const s = spine([
    entry({ id: "a", kind: "relationship_shift", summary: "你与欣蓝的关系有了新变化——看起来更信任你了。", anchors: { npcIds: ["N-010"] } }),
  ]);
  const lines = buildNpcMemoryMomentLines(s, "N-010");
  assert.deepEqual(lines, ["你与欣蓝的关系有了新变化——看起来更信任你了。"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMemoryCandidates } from "./extract";

function baseInput(overrides: Partial<Parameters<typeof extractMemoryCandidates>[0]> = {}) {
  return {
    nowHour: 10,
    resolvedTurn: {},
    before: {
      playerLocation: "B1_SafeZone",
      activeTaskIds: [],
      presentNpcIds: [],
      mainThreatByFloor: {},
    },
    after: {
      playerLocation: "B1_SafeZone",
      tasks: [],
      codex: {},
      mainThreatByFloor: {},
    },
    ...overrides,
  } as Parameters<typeof extractMemoryCandidates>[0];
}

test("relationship_shift 摘要使用图鉴展示名而非内部 npcId", () => {
  const out = extractMemoryCandidates(
    baseInput({
      resolvedTurn: { relationship_updates: [{ npcId: "N-010", trust: 3 }] },
      after: {
        playerLocation: "B1_SafeZone",
        tasks: [],
        codex: { "N-010": { id: "N-010", type: "npc", name: "欣蓝", trust: 3 } },
        mainThreatByFloor: {},
      },
    })
  );
  const rel = out.find((c) => c.kind === "relationship_shift");
  assert.ok(rel, "应生成 relationship_shift 记忆");
  assert.ok(rel!.summary.includes("欣蓝"), `摘要应包含展示名，实际："${rel!.summary}"`);
  assert.ok(!rel!.summary.includes("N-010"), `摘要不应包含内部 npcId，实际："${rel!.summary}"`);
  assert.ok(!/[+-]?\d/.test(rel!.summary), `摘要不应包含原始数值，实际："${rel!.summary}"`);
});

test("relationship_shift 摘要在图鉴无展示名时回退到 npcId（不报错，但仍应生成记忆）", () => {
  const out = extractMemoryCandidates(
    baseInput({
      resolvedTurn: { relationship_updates: [{ npcId: "N-099", favorability: 5 }] },
    })
  );
  const rel = out.find((c) => c.kind === "relationship_shift");
  assert.ok(rel, "即使图鉴无该 npc 展示名，也应生成记忆（回退用 npcId）");
  assert.equal(rel!.anchors.npcIds?.[0], "N-099");
});

test("relationship_shift 摘要取绝对值最大的字段作为定性描述headline", () => {
  const out = extractMemoryCandidates(
    baseInput({
      resolvedTurn: { relationship_updates: [{ npcId: "N-010", favorability: 2, trust: -8 }] },
      after: {
        playerLocation: "B1_SafeZone",
        tasks: [],
        codex: { "N-010": { id: "N-010", type: "npc", name: "欣蓝", trust: -8, favorability: 2 } },
        mainThreatByFloor: {},
      },
    })
  );
  const rel = out.find((c) => c.kind === "relationship_shift");
  assert.ok(rel);
  // trust=-8 绝对值最大，应体现"戒心"而非 favorability 的措辞
  assert.ok(rel!.summary.includes("戒心"), `应选中绝对值最大的 trust 字段，实际："${rel!.summary}"`);
});

test("relationship_shift：所有 delta 均为 0 或缺失时不生成记忆", () => {
  const out = extractMemoryCandidates(
    baseInput({
      resolvedTurn: { relationship_updates: [{ npcId: "N-010", favorability: 0 }] },
    })
  );
  assert.equal(out.some((c) => c.kind === "relationship_shift"), false);
});

test("relationship_shift：anchors.npcIds 仍正确写入，供 relationshipMemoryDisplay 按 npcId 过滤", () => {
  const out = extractMemoryCandidates(
    baseInput({
      resolvedTurn: { relationship_updates: [{ npcId: "N-010", trust: 4 }] },
      after: {
        playerLocation: "B1_SafeZone",
        tasks: [],
        codex: { "N-010": { id: "N-010", type: "npc", name: "欣蓝" } },
        mainThreatByFloor: {},
      },
    })
  );
  const rel = out.find((c) => c.kind === "relationship_shift");
  assert.deepEqual(rel!.anchors.npcIds, ["N-010"]);
  assert.equal(rel!.mergeKey, "rel:N-010");
});

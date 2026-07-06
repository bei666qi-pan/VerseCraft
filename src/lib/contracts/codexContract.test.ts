/**
 * 图鉴（Codex）系统契约测试
 *
 * 验证图鉴条目的完整生命周期：
 * - NPC 发现与注册
 * - 异常（Anomaly）发现与注册
 * - 好感度增减
 * - 关系状态变迁
 * - 图鉴计数
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

type CodexEntryType = "npc" | "anomaly" | "location" | "item";

interface CodexEntry {
  id: string;
  name: string;
  type: CodexEntryType;
  favorability: number;
  discovered: boolean;
  discoveredAtTurn: number;
  notes: string[];
}

interface CodexState {
  entries: Record<string, CodexEntry>;
  totalNpcDiscovered: number;
  totalAnomaliesDiscovered: number;
}

function createCodexEntry(id: string, name: string, type: CodexEntryType, turn: number): CodexEntry {
  return {
    id,
    name,
    type,
    favorability: type === "npc" ? 0 : 0,
    discovered: true,
    discoveredAtTurn: turn,
    notes: [],
  };
}

function ensureCodexEntry(state: CodexState, id: string, name: string, type: CodexEntryType, turn: number): { newState: CodexState; isNew: boolean } {
  if (state.entries[id]) {
    return { newState: { ...state }, isNew: false };
  }
  const entry = createCodexEntry(id, name, type, turn);
  return {
    newState: {
      ...state,
      entries: { ...state.entries, [id]: entry },
      totalNpcDiscovered: state.totalNpcDiscovered + (type === "npc" ? 1 : 0),
      totalAnomaliesDiscovered: state.totalAnomaliesDiscovered + (type === "anomaly" ? 1 : 0),
    },
    isNew: true,
  };
}

function updateFavorability(state: CodexState, id: string, delta: number): { newState: CodexState; changed: boolean } {
  const entry = state.entries[id];
  if (!entry || entry.type !== "npc") return { newState: { ...state }, changed: false };
  const newFav = Math.max(-50, Math.min(100, entry.favorability + delta));
  return {
    newState: {
      ...state,
      entries: {
        ...state.entries,
        [id]: { ...entry, favorability: newFav },
      },
    },
    changed: newFav !== entry.favorability,
  };
}

function getRelationshipLabel(favorability: number): string {
  if (favorability >= 80) return "信任";
  if (favorability >= 60) return "友好";
  if (favorability >= 30) return "认识";
  if (favorability >= 0) return "陌路";
  if (favorability >= -30) return "冷淡";
  return "敌对";
}

function addCodexNote(state: CodexState, id: string, note: string): { newState: CodexState; added: boolean } {
  const entry = state.entries[id];
  if (!entry) return { newState: { ...state }, added: false };
  return {
    newState: {
      ...state,
      entries: {
        ...state.entries,
        [id]: { ...entry, notes: [...entry.notes, note] },
      },
    },
    added: true,
  };
}

function listUndiscoveredNpcs(allNpcIds: string[], discoveredIds: string[]): string[] {
  const discovered = new Set(discoveredIds);
  return allNpcIds.filter((id) => !discovered.has(id));
}

describe("图鉴系统契约", () => {
  const emptyCodex: CodexState = { entries: {}, totalNpcDiscovered: 0, totalAnomaliesDiscovered: 0 };

  describe("NPC 发现", () => {
    it("首次遭遇 NPC 应创建图鉴条目", () => {
      const { newState, isNew } = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 3);
      assert.equal(isNew, true);
      assert.equal(newState.totalNpcDiscovered, 1);
      assert.ok(newState.entries["N-007"]);
      assert.equal(newState.entries["N-007"]!.name, "廖暗");
      assert.equal(newState.entries["N-007"]!.discoveredAtTurn, 3);
    });

    it("重复遭遇同一 NPC 不重复创建", () => {
      let state = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 3).newState;
      const { isNew } = ensureCodexEntry(state, "N-007", "廖暗", "npc", 10);
      assert.equal(isNew, false);
      assert.equal(state.totalNpcDiscovered, 1);
    });

    it("异常发现独立计数", () => {
      const r1 = ensureCodexEntry(emptyCodex, "ANOM-001", "暗月残片", "anomaly", 5);
      const r2 = ensureCodexEntry(r1.newState, "N-007", "廖暗", "npc", 6);
      assert.equal(r2.newState.totalNpcDiscovered, 1);
      assert.equal(r2.newState.totalAnomaliesDiscovered, 1);
    });
  });

  describe("好感度变更", () => {
    it("正面互动增加好感", () => {
      let state = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 1).newState;
      state = { ...state, entries: { ...state.entries, "N-007": { ...state.entries["N-007"]!, favorability: 10 } } };
      const { newState, changed } = updateFavorability(state, "N-007", 5);
      assert.equal(changed, true);
      assert.equal(newState.entries["N-007"]!.favorability, 15);
    });

    it("背叛/冒犯减少好感", () => {
      let state = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 1).newState;
      state = { ...state, entries: { ...state.entries, "N-007": { ...state.entries["N-007"]!, favorability: 30 } } };
      const { newState } = updateFavorability(state, "N-007", -20);
      assert.equal(newState.entries["N-007"]!.favorability, 10);
    });

    it("好感度不会低于 -50", () => {
      let state = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 1).newState;
      state = { ...state, entries: { ...state.entries, "N-007": { ...state.entries["N-007"]!, favorability: -45 } } };
      const { newState } = updateFavorability(state, "N-007", -10);
      assert.equal(newState.entries["N-007"]!.favorability, -50);
    });

    it("好感度不会超过 100", () => {
      let state = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 1).newState;
      state = { ...state, entries: { ...state.entries, "N-007": { ...state.entries["N-007"]!, favorability: 95 } } };
      const { newState } = updateFavorability(state, "N-007", 10);
      assert.equal(newState.entries["N-007"]!.favorability, 100);
    });

    it("异常类型不接受好感度", () => {
      let state = ensureCodexEntry(emptyCodex, "ANOM-001", "暗月残片", "anomaly", 1).newState;
      const { changed } = updateFavorability(state, "ANOM-001", 5);
      assert.equal(changed, false);
    });
  });

  describe("关系标签", () => {
    it("正确映射好感度到关系标签", () => {
      assert.equal(getRelationshipLabel(85), "信任");
      assert.equal(getRelationshipLabel(65), "友好");
      assert.equal(getRelationshipLabel(45), "认识");
      assert.equal(getRelationshipLabel(10), "陌路");
      assert.equal(getRelationshipLabel(-10), "冷淡");
      assert.equal(getRelationshipLabel(-40), "敌对");
    });
  });

  describe("图鉴备注", () => {
    it("为已有条目添加备注", () => {
      let state = ensureCodexEntry(emptyCodex, "N-007", "廖暗", "npc", 1).newState;
      const { added } = addCodexNote(state, "N-007", "在走廊尽头看见了不该看见的东西");
      assert.equal(added, true);
    });

    it("为不存在的条目添加备注失败", () => {
      const { added } = addCodexNote(emptyCodex, "N-999", "不存在");
      assert.equal(added, false);
    });
  });

  describe("未发现 NPC 追踪", () => {
    it("正确列出未发现的 NPC", () => {
      const allNpcs = ["N-007", "N-008", "N-010", "N-015"];
      const undiscovered = listUndiscoveredNpcs(allNpcs, ["N-007"]);
      assert.deepEqual(undiscovered, ["N-008", "N-010", "N-015"]);
    });

    it("全部发现后列表为空", () => {
      const allNpcs = ["N-007", "N-008"];
      const undiscovered = listUndiscoveredNpcs(allNpcs, ["N-007", "N-008"]);
      assert.equal(undiscovered.length, 0);
    });
  });
});

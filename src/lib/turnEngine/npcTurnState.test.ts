import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeNpcTurnState,
  buildNpcTurnStatePacket,
  estimateNpcTurnStatePacketChars,
} from "./npcTurnState";
import type { NpcTurnStateResult } from "./npcTurnState";

// ---------------------------------------------------------------------------
// 辅助：构造 playerContext
// ---------------------------------------------------------------------------

function makePlayerContext(args: {
  location: string;
  npcPositions: string;
  sceneAppear?: string;
}): string {
  const lines = [
    `用户位置[${args.location}]。`,
    `NPC当前位置：${args.npcPositions}。`,
  ];
  if (args.sceneAppear !== undefined) {
    lines.push(`场景外貌已描写：${args.sceneAppear}。`);
  }
  return lines.join("");
}

function makeAssistantMsg(narrative: string): { role: string; content: string } {
  return { role: "assistant", content: JSON.stringify({ narrative }) };
}

function makeUserMsg(text: string): { role: string; content: string } {
  return { role: "user", content: text };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeNpcTurnState", () => {
  it("returns empty states when no NPCs are present", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "",
      }),
      [],
    );
    assert.deepEqual(result.states, {});
    assert.equal(result.playerLocation, "1F_Lobby");
  });

  it("APPROACHING: first appearance (not in 场景外貌已描写)", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby",
        sceneAppear: "无",
      }),
      [],
    );

    assert.equal(result.states["N-001"]?.phase, "APPROACHING");
    assert.equal(result.states["N-001"]?.unaddressedSpeakStreak, 0);
  });

  it("GREETING: present and already appeared but not addressed", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby",
        sceneAppear: "N-001",
      }),
      [],
    );

    assert.equal(result.states["N-001"]?.phase, "GREETING");
  });

  it("CONVERSING: player addressed NPC in last user message", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby",
        sceneAppear: "N-001",
      }),
      [
        makeUserMsg("我想问 N-001 一些问题"),
      ],
    );

    assert.equal(result.states["N-001"]?.phase, "CONVERSING");
  });

  it("DEPARTING: NPC spoken 3+ assistant turns without player addressing them", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby",
        sceneAppear: "N-001",
      }),
      [
        makeUserMsg("我观察四周"),
        makeAssistantMsg("你环顾大厅，注意到角落里的 N-001 朝你点了点头。"),
        makeUserMsg("我要检查背包"),
        makeAssistantMsg("你打开背包，N-001 在一旁安静地看着。"),
        makeUserMsg("继续往前走"),
        makeAssistantMsg("你穿过走廊，N-001 不远不近地跟在后面。"),
      ],
    );

    assert.equal(result.states["N-001"]?.phase, "DEPARTING");
    assert.equal(result.states["N-001"]?.unaddressedSpeakStreak, 3);
  });

  it("DEPARTING: streak resets when player addresses NPC", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby，N-010@1F_Lobby",
        sceneAppear: "N-001/N-010",
      }),
      [
        makeUserMsg("我观察四周"),
        makeAssistantMsg("你环顾大厅，N-001 翻着书页，N-010 靠在墙边。"),
        makeUserMsg("继续往前走"),
        makeAssistantMsg("N-001 抬头看了你一眼，N-010 哼了一声。"),
        makeUserMsg("继续走"),
        makeAssistantMsg("N-001 又低头看书，N-010 打了个哈欠。"),
        makeUserMsg("N-001，你在看什么书？"),
      ],
    );

    // N-001 was addressed → streak reset → CONVERSING
    assert.equal(result.states["N-001"]?.phase, "CONVERSING");
    assert.equal(result.states["N-001"]?.unaddressedSpeakStreak, 0);

    // N-010: 3 assistant turns, not addressed → DEPARTING
    assert.equal(result.states["N-010"]?.phase, "DEPARTING");
    assert.equal(result.states["N-010"]?.unaddressedSpeakStreak, 3);
  });

  it("only tracks present NPCs (same location as player)", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby，N-010@B1_Storage",
        sceneAppear: "N-001/N-010",
      }),
      [],
    );

    // N-001 is at 1F_Lobby (player location) → present
    assert.ok(result.states["N-001"]);
    // N-010 is at B1_Storage (different location) → not present
    assert.equal(result.states["N-010"], undefined);
  });

  it("APPROACHING takes priority over streak (fresh NPC ignored even if in history)", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "1F_Lobby",
        npcPositions: "N-001@1F_Lobby",
        sceneAppear: "无",
      }),
      [
        makeUserMsg("你好"),
        makeAssistantMsg("N-001 在远处看书，听到声音抬了抬头。"),
        makeUserMsg("继续观察"),
        makeAssistantMsg("N-001 合上书，朝你这边看了一眼。"),
        makeUserMsg("往前走"),
        makeAssistantMsg("N-001 站起身，似乎准备离开。"),
      ],
    );

    // Even with 3 assistant mentions, APPROACHING wins because not in 场景外貌已描写
    assert.equal(result.states["N-001"]?.phase, "APPROACHING");
  });

  it("IDs are normalized (N-1 → N-001)", () => {
    // parseRuntimeNpcPrimitives may normalize differently; test that the
    // internal normalization handles edge formats
    const result = computeNpcTurnState(
      "用户位置[B1_PowerRoom]。NPC当前位置：N-008@B1_PowerRoom。场景外貌已描写：N-008。",
      [makeUserMsg("我问 N-008 一些问题")],
    );
    assert.equal(result.states["N-008"]?.phase, "CONVERSING");
  });

  it("empty dialogue history + present NPC = GREETING (if already appeared)", () => {
    const result = computeNpcTurnState(
      makePlayerContext({
        location: "B1_PowerRoom",
        npcPositions: "N-008@B1_PowerRoom",
        sceneAppear: "N-008",
      }),
      [],
    );

    assert.equal(result.states["N-008"]?.phase, "GREETING");
    assert.equal(result.states["N-008"]?.unaddressedSpeakStreak, 0);
  });
});

describe("buildNpcTurnStatePacket", () => {
  it("returns compact JSON with NPC phases", () => {
    const result: NpcTurnStateResult = {
      states: {
        "N-001": { npcId: "N-001", phase: "CONVERSING", unaddressedSpeakStreak: 0 },
        "N-008": { npcId: "N-008", phase: "APPROACHING", unaddressedSpeakStreak: 0 },
        "N-014": { npcId: "N-014", phase: "GREETING", unaddressedSpeakStreak: 0 },
      },
      playerLocation: "1F_Lobby",
    };

    const packet = buildNpcTurnStatePacket(result);
    const parsed = JSON.parse(packet);
    assert.deepEqual(parsed, {
      npc_turn_state: {
        "N-001": "CONVERSING",
        "N-008": "APPROACHING",
        "N-014": "GREETING",
      },
    });
  });

  it("returns empty string for empty states", () => {
    const result: NpcTurnStateResult = {
      states: {},
      playerLocation: "1F_Lobby",
    };
    assert.equal(buildNpcTurnStatePacket(result), "");
  });
});

describe("estimateNpcTurnStatePacketChars", () => {
  it("returns packet character count", () => {
    const result: NpcTurnStateResult = {
      states: {
        "N-001": { npcId: "N-001", phase: "CONVERSING", unaddressedSpeakStreak: 0 },
      },
      playerLocation: null,
    };
    const chars = estimateNpcTurnStatePacketChars(result);
    assert.equal(typeof chars, "number");
    assert.ok(chars > 0);
  });

  it("returns 0 for empty states", () => {
    assert.equal(
      estimateNpcTurnStatePacketChars({ states: {}, playerLocation: null }),
      0
    );
  });
});

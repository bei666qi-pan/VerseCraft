import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSceneActorGate } from "./sceneActorGate";

function ctx(location: string, npcPositions: string): string {
  return [
    `player_location[${location}]`,
    `NPC当前位置：${npcPositions}`,
  ].join("\n");
}

describe("buildSceneActorGate", () => {
  it("同场唯一 NPC 自动 focus，并优先使用 playerContext 位置", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("1F_Lobby", "N-001@1F_Lobby，N-010@7F_Bench"),
      latestUserInput: "我先观察周围。",
      playerLocation: "7F_Bench",
    });

    assert.equal(gate.currentLocation, "1F_Lobby");
    assert.deepEqual(gate.presentNpcIds, ["N-001"]);
    assert.equal(gate.focusNpcId, "N-001");
    assert.equal(gate.modeByNpcId["N-001"], "target_present");
    assert.ok(gate.canSpeakNpcIds.includes("N-001"));
  });

  it("多 NPC 同场无目标时不猜 focus", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("1F_Lobby", "N-001@1F_Lobby，N-002@1F_Lobby，N-010@7F_Bench"),
      latestUserInput: "我停在门口听动静。",
      playerLocation: null,
    });

    assert.deepEqual(gate.presentNpcIds, ["N-001", "N-002"]);
    assert.equal(gate.focusNpcId, null);
    assert.equal(gate.ambiguity.multiPresentNoFocus, true);
    assert.equal(gate.modeByNpcId["N-001"], "present");
    assert.equal(gate.modeByNpcId["N-002"], "present");
  });

  it("玩家输入 N-015 且在场时 target_present", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("B1_SafeZone", "N-015@B1_SafeZone，N-010@7F_Bench"),
      latestUserInput: "我问 N-015 刚才有没有听见电梯声。",
      playerLocation: null,
    });

    assert.deepEqual(gate.mentionedNpcIds, ["N-015"]);
    assert.equal(gate.focusNpcId, "N-015");
    assert.equal(gate.modeByNpcId["N-015"], "target_present");
    assert.ok(gate.canSpeakNpcIds.includes("N-015"));
  });

  it("玩家输入 N-010 但离场时 heard_only 且不能 speak", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("1F_Lobby", "N-001@1F_Lobby，N-010@7F_Bench"),
      latestUserInput: "我想到 N-010 刚才说过的话。",
      playerLocation: null,
    });

    assert.equal(gate.focusNpcId, null);
    assert.equal(gate.modeByNpcId["N-010"], "heard_only");
    assert.ok(gate.offscreenNpcIds.includes("N-010"));
    assert.ok(!gate.canSpeakNpcIds.includes("N-010"));
  });

  it("relationshipHints 中 NPC 离场时 memory_only", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("1F_Lobby", "N-001@1F_Lobby，N-018@4F_CorridorEnd"),
      latestUserInput: "我翻看图鉴里的旧记录。",
      playerLocation: null,
      relationshipHints: ["N-018|好感40|旧记录"],
    });

    assert.equal(gate.modeByNpcId["N-018"], "memory_only");
    assert.deepEqual(gate.memoryOnlyNpcIds, ["N-018"]);
    assert.ok(!gate.canSpeakNpcIds.includes("N-018"));
  });

  it("remoteContactNpcIds 允许离场 NPC 远程 speak", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("1F_Lobby", "N-001@1F_Lobby，N-010@7F_Bench"),
      latestUserInput: "我按住通讯符号呼叫 N-010。",
      playerLocation: null,
      remoteContactNpcIds: ["N-010"],
    });

    assert.equal(gate.modeByNpcId["N-010"], "remote_contact");
    assert.ok(gate.offscreenNpcIds.includes("N-010"));
    assert.ok(gate.canSpeakNpcIds.includes("N-010"));
  });

  it("unknown / malformed input 不崩溃", () => {
    const gate = buildSceneActorGate({
      playerContext: "not a normal context\nNPC当前位置：N-bad@???，N-001@",
      latestUserInput: "我问 N-999，也提到 N-abc。",
      playerLocation: null,
      controlTarget: "not-an-npc",
      relationshipHints: ["broken", "N-777"],
      remoteContactNpcIds: ["bad", "N-888"],
    });

    assert.equal(gate.schema, "scene_actor_gate_v1");
    assert.deepEqual(gate.presentNpcIds, []);
    assert.equal(gate.modeByNpcId["N-999"], "heard_only");
    assert.equal(gate.modeByNpcId["N-777"], "memory_only");
    assert.equal(gate.modeByNpcId["N-888"], "remote_contact");
  });

  it("packet 字符串规则 compactRules 不超过 4 条", () => {
    const gate = buildSceneActorGate({
      playerContext: ctx("1F_Lobby", "N-001@1F_Lobby"),
      latestUserInput: "",
      playerLocation: null,
    });

    assert.ok(gate.compactRules.length > 0);
    assert.ok(gate.compactRules.length <= 4);
  });
});

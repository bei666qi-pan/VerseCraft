import assert from "node:assert/strict";
import test from "node:test";
import { MODEL_OUTPUT_STRICT_JSON_SCHEMA } from "./schema";
import { buildNarrativePromptPacket } from "./promptBuilder";
import type { DialogueContext } from "./types";

const context: DialogueContext = {
  requestId: "req_prompt_1",
  sessionId: "sess_prompt_1",
  userId: "user_prompt_1",
  player: {
    locationId: "B1_SafeZone",
    time: { day: 1, hour: 8 },
    stats: { sanity: 80, hp: 10 },
    inventoryIds: ["I-C03"],
    currentProfession: "keeper",
    knownFactIds: ["fact:known"],
    discoveredClueIds: ["clue:first"],
  },
  chapter: {
    chapterId: "chapter-1",
    status: "active",
    sceneId: "B1_SafeZone",
    objective: "确认走廊是否安全。",
    completedBeatIds: ["wake"],
    allowedEventIds: ["observe"],
    blockedEventIds: ["deep_reveal"],
  },
  activeNpc: {
    npcId: "N-010",
    displayName: "辛岚",
    publicRole: "临时向导",
    speechContract: "冷静、短句、避免替玩家做决定",
    coreDrive: "阻止玩家误入假出口",
    coreFear: "替玩家选择命运",
    tabooBoundary: "不能强迫玩家相信她",
    truthfulnessBand: "high",
    attitudeLabel: "克制关切",
    relation: { trust: 55 },
    knownFactIds: ["fact:known"],
    forbiddenFactIds: ["fact:secret"],
  },
  npcMemories: [
    {
      id: 1,
      npcId: "N-010",
      scope: "session",
      kind: "observation",
      summary: "辛岚注意到玩家在门前停顿。",
      salience: 70,
      confidence: 85,
    },
  ],
  world: {
    worldId: "base_apartment",
    loreFacts: [
      {
        factKey: "world:rule:safe-zone",
        canonicalText: "安全区不能被当成确定出口。",
        layer: "core",
        tags: ["B1_SafeZone"],
      },
      {
        factKey: "fact:secret",
        canonicalText: "终局真相不应在此处出现。",
        layer: "dm_only",
        tags: [],
      },
    ],
    hardRules: ["安全区不能被当成确定出口。"],
    allowedEntityIds: ["B1_SafeZone", "N-010", "I-C03", "world:rule:safe-zone"],
    forbiddenFactIds: ["fact:secret"],
    revealTier: 1,
  },
  recentEvents: [
    {
      id: 7,
      turnIndex: 3,
      actorType: "player",
      actorId: "player",
      eventType: "player_action",
      summary: "玩家检查了安全区边缘。",
    },
  ],
  rawCompatibility: {
    playerContext: "raw summary",
    clientState: null,
  },
};

test("buildNarrativePromptPacket renders fixed packet sections in order", () => {
  const packet = buildNarrativePromptPacket(context);
  const expected = [
    "## 稳定系统规则",
    "## 世界规则包",
    "## 当前章节包",
    "## 当前场景包",
    "## NPC 身份包",
    "## NPC 已知信息边界",
    "## NPC 记忆包",
    "## 玩家状态包",
    "## 最近事件包",
    "## 禁止透露信息包",
    "## 输出 Schema 包",
    "## 风格约束包",
  ];

  let previous = -1;
  for (const marker of expected) {
    const index = packet.system.indexOf(marker);
    assert.ok(index > previous, `${marker} should appear after previous section`);
    previous = index;
  }
  assert.deepEqual(packet.debugPacket.sectionOrder, expected.map((marker) => marker.replace("## ", "")));
});

test("buildNarrativePromptPacket uses NPC profile fields without inventing style", () => {
  const packet = buildNarrativePromptPacket(context);

  assert.match(packet.system, /冷静、短句、避免替玩家做决定/);
  assert.match(packet.system, /阻止玩家误入假出口/);
  assert.match(packet.system, /辛岚注意到玩家在门前停顿/);
  assert.doesNotMatch(packet.system, /温柔俏皮|神秘莫测|毒舌/);
});

test("buildNarrativePromptPacket hides forbidden lore text from usable world packet", () => {
  const packet = buildNarrativePromptPacket(context);
  const packets = packet.debugPacket.packets as Record<string, Record<string, unknown>>;
  const worldRules = JSON.stringify(packets["世界规则包"]);
  const forbidden = JSON.stringify(packets["禁止透露信息包"]);

  assert.match(worldRules, /安全区不能被当成确定出口/);
  assert.doesNotMatch(worldRules, /终局真相不应在此处出现/);
  assert.match(forbidden, /fact:secret/);
  assert.doesNotMatch(forbidden, /终局真相不应在此处出现/);
});

test("buildNarrativePromptPacket includes strict schema preference without requiring provider lock-in", () => {
  const packet = buildNarrativePromptPacket(context);
  const outputFormat = packet.debugPacket.outputFormat as Record<string, unknown>;

  assert.equal(outputFormat.preferred, "openai_structured_outputs_json_schema_strict");
  assert.equal(outputFormat.currentGatewayFallback, "response_format_json_object");
  assert.deepEqual(outputFormat.strictJsonSchema, MODEL_OUTPUT_STRICT_JSON_SCHEMA);
  assert.match(packet.developer ?? "", /provider 只支持 JSON object/);
});

test("buildNarrativePromptPacket does not fabricate missing latest user input", () => {
  const packet = buildNarrativePromptPacket(context);

  assert.match(packet.user, /调用方随后追加的真实玩家输入/);
  assert.match(packet.user, /如果没有收到真实玩家输入，不要补写玩家动作/);
  assert.doesNotMatch(packet.user, /检查安全区边缘/);
});


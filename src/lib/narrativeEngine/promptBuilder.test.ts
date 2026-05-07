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
    title: "暗月初醒",
    status: "active",
    sceneId: "B1_SafeZone",
    phase: "选择回响",
    promise: "第一道异常会在门后的回声里继续逼近。",
    mainQuestion: "门后的回声究竟指向哪里？",
    emotionalTone: "克制、悬疑、余波未散",
    mustEchoSummaries: ["玩家答应沿门后的回声继续查下去。"],
    unresolvedThreads: ["门后的回声留下新的调查钩子。"],
    forbiddenRevealIds: ["fact:secret"],
    closePolicy: "本章仍由正文自然推进；不要主动宣布章节结束。",
    writerInstruction: "让玩家刚做出的选择在场景里被自然回响。",
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
    "## 当前章节导演包",
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

test("buildNarrativePromptPacket renders a writer-safe chapter director packet", () => {
  const packet = buildNarrativePromptPacket(context);
  const packets = packet.debugPacket.packets as Record<string, Record<string, unknown>>;
  const chapter = packets["当前章节导演包"];
  const chapterJson = JSON.stringify(chapter);

  assert.equal(chapter.chapterTitle, context.chapter.title);
  assert.equal(chapter.currentWritingGoal, context.chapter.writerInstruction);
  assert.equal(chapter.chapterPromise, context.chapter.promise);
  assert.equal(chapter.chapterMainQuestion, context.chapter.mainQuestion);
  assert.deepEqual(chapter.forbiddenEarlyRevealHints, [
    "禁止提前揭露的未解内容 1：只写表层征兆、误导、情绪反应或调查方向。",
  ]);
  assert.doesNotMatch(chapterJson, /fact:secret/);
  assert.doesNotMatch(chapterJson, /终局真相不应在此处出现/);
  assert.match(chapterJson, /不要在 narrative 中写“本章完成”/);
  assert.match(chapterJson, /Writer 不能决定章节是否关闭/);
  assert.match(chapterJson, /我蹲下身，确认水迹到底从哪里开始/);
  assert.match(chapterJson, /我装作没听见，先观察陈婆婆的反应/);
  assert.match(chapterJson, /调查门缝/);
  assert.match(chapterJson, /使用道具/);
  assert.match(chapterJson, /打开图鉴/);
});

test("buildNarrativePromptPacket keeps chapter director packet free of internal budgets and completion demands", () => {
  const packet = buildNarrativePromptPacket(context);
  const packets = packet.debugPacket.packets as Record<string, Record<string, unknown>>;
  const chapterJson = JSON.stringify(packets["当前章节导演包"]);

  for (const field of ["pressureBudget", "softMaxTurns", "targetTurns", "minTurns", "startedTurn", "confidence"]) {
    assert.equal(chapterJson.includes(field), false);
  }
  assert.match(chapterJson, /选项必须是第一人称小说式行动/);
  assert.match(chapterJson, /Writer 不能决定章节是否关闭/);
  assert.doesNotMatch(packet.system, /请.*本章完成/);
  assert.doesNotMatch(packet.system, /必须.*本章完成/);
  assert.doesNotMatch(packet.system, /输出“本章完成”/);
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

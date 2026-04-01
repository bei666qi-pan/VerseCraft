import test from "node:test";
import assert from "node:assert/strict";
import { buildCombatPromptBlockV1 } from "./combatPromptBlock";

test("combatPromptBlock V1: major NPC 风格可辨识且文本受 maxChars 限制", () => {
  const text = buildCombatPromptBlockV1({
    lastUserInput: "我拔刀要砍过去，趁其不备冲上去按住他",
    locationId: "1F_Hallway",
    time: { day: 1, hour: 23 },
    mainThreatByFloor: { "1": { floorId: "1", threatId: "A-001", phase: "active" } },
    tasks: [],
    stats: { sanity: 18, agility: 8, luck: 6, charm: 5, background: 9 } as any,
    equippedWeapon: null,
    codex: {
      "N-010": { id: "N-010", type: "npc", name: "登记口", favorability: 0, weakness: "犹豫" } as any,
    },
    npcHeartViews: [
      {
        profile: { npcId: "N-010", charmTier: "major_charm" },
        attitudeLabel: "hostile",
      } as any,
    ],
    maxChars: 520,
  });

  assert.ok(text.length > 40);
  assert.ok(text.length <= 520);
  assert.ok(text.includes("【冲突回合·战斗裁决锚（V1）】"));
  assert.ok(text.includes("禁止："));
  assert.ok(text.includes("焦点："));
  assert.ok(text.includes("当前态势："));
  assert.ok(text.includes("结果层级："));
  // N-010 在注册表里是“登记口交易·条件与撤离窗口”
  assert.ok(text.includes("登记口交易"));
});


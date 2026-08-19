import test from "node:test";
import assert from "node:assert/strict";
import { moderationTextForPrivateStoryChat, validateChatRequest } from "@/lib/security/chatValidation";

test("validateChatRequest: openingOptionsOnlyRound defaults to false", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
  });
  assert.ok(v.ok);
  assert.equal(v.openingOptionsOnlyRound, false);
});

test("validateChatRequest: openingOptionsOnlyRound accepts true", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
    openingOptionsOnlyRound: true,
  });
  assert.ok(v.ok);
  assert.equal(v.openingOptionsOnlyRound, true);
});

test("validateChatRequest: clientPurpose defaults to normal", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
  });
  assert.ok(v.ok);
  assert.equal(v.clientPurpose, "normal");
  assert.equal(v.language, "zh-CN");
});

test("validateChatRequest: accepts English response language and rejects unknown values", () => {
  const english = validateChatRequest({
    messages: [{ role: "user", content: "look at the door" }],
    playerContext: "ctx",
    language: "en-US",
  });
  assert.ok(english.ok);
  assert.equal(english.language, "en-US");

  const unknown = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    language: "fr-FR",
  });
  assert.ok(unknown.ok);
  assert.equal(unknown.language, "zh-CN");
});

test("validateChatRequest: clientPurpose accepts options_regen_only", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
    clientPurpose: "options_regen_only",
  });
  assert.ok(v.ok);
  assert.equal(v.clientPurpose, "options_regen_only");
});

test("validateChatRequest: options regen metadata is sanitized and preserved", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
    clientPurpose: "options_regen_only",
    clientReason: "  【为何需要整理选项】用户手动点击刷新选项按钮  ",
    clientTurnModeHint: "decision_required",
  });
  assert.ok(v.ok);
  assert.equal(v.clientReason, "【为何需要整理选项】用户手动点击刷新选项按钮");
  assert.equal(v.clientTurnModeHint, "decision_required");
});

test("validateChatRequest: invalid options regen turn mode hint is dropped", () => {
  const v = validateChatRequest({
    messages: [{ role: "user", content: "hi" }],
    playerContext: "ctx",
    sessionId: "s",
    clientState: null,
    clientPurpose: "options_regen_only",
    clientTurnModeHint: "bad_mode",
  });
  assert.ok(v.ok);
  assert.equal(v.clientTurnModeHint, null);
});

test("moderationTextForPrivateStoryChat：options_regen_only 使用固定短句，不送审整段模板", () => {
  const long = "死亡 道具 抹杀 OPTIONS_REGEN 协议说明";
  assert.equal(
    moderationTextForPrivateStoryChat("options_regen_only", long),
    "刷新可选行动"
  );
});

test("moderationTextForPrivateStoryChat：normal 沿用 latestUserInput", () => {
  assert.equal(moderationTextForPrivateStoryChat("normal", "玩家输入"), "玩家输入");
});

test("validateChatRequest: legacy client state is explicitly scoped to Dark Moon", () => {
  const result = validateChatRequest({
    messages: [{ role: "user", content: "查看四周" }],
    clientState: {
      v: 1,
      turnIndex: 0,
      playerLocation: "B1_SafeZone",
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
    },
  });
  assert.ok(result.ok);
  assert.equal(result.clientState?.worldId, "dark_moon_prologue");
  assert.equal(result.clientState?.mapId, "dark_moon_apartment");
});

test("validateChatRequest: rejects cross-world map before generation", () => {
  const result = validateChatRequest({
    messages: [{ role: "user", content: "前往坊市" }],
    clientState: {
      v: 1,
      worldId: "xingni_taichu",
      mapId: "dark_moon_apartment",
      turnIndex: 0,
      playerLocation: "QS_GUOYAN_INN",
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /地图不属于当前世界/);
});

test("validateChatRequest: bounds Xingni world state digest", () => {
  const result = validateChatRequest({
    messages: [{ role: "user", content: "吐纳修炼" }],
    clientState: {
      v: 1,
      worldId: "xingni_taichu",
      mapId: "xingni_qingshi_county",
      turnIndex: 2,
      playerLocation: "QS_SPIRIT_SPRING_CAVE",
      worldStateDigest: {
        kind: "xingni_taichu",
        cultivation: { realm: "炼气2层", progress: 9999, qiSeaDamaged: true },
        spiritRoot: "玄水",
        spiritStones: 12,
        credentials: ["combat", "invented"],
        unlockedMapIds: ["xingni_qingshi_county"],
      },
    },
  });
  assert.ok(result.ok);
  assert.equal(result.clientState?.worldStateDigest?.cultivation.progress, 100);
  assert.deepEqual(result.clientState?.worldStateDigest?.credentials, ["combat"]);
});

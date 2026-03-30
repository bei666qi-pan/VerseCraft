import test from "node:test";
import assert from "node:assert/strict";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import type { NpcProfileV2 } from "@/lib/registry/types";
import { buildNpcHeartProfile } from "./build";
import { buildNpcHeartRuntimeView } from "./selectors";
import { buildNpcHeartPromptBlock } from "./prompt";
import { resolvePersonalityBundle } from "./personalityCore";

function v2Profile(id: string): NpcProfileV2 | null {
  return (CORE_NPC_PROFILES_V2 as readonly NpcProfileV2[]).find((p) => p.id === id) ?? null;
}

test("高魅力六人 personalityCore 显式存在且彼此可区分", () => {
  const ids = ["N-015", "N-020", "N-010", "N-018", "N-013", "N-007"] as const;
  const signatures = ids.map((id) => {
    const b = resolvePersonalityBundle({ npcId: id, profileV2: v2Profile(id), social: null });
    return `${b.core.speechCadence}||${b.core.identityTension}||${b.core.memoryResidueFlavor}`;
  });
  const unique = new Set(signatures);
  assert.equal(unique.size, 6, "六人核心签名应互不重复");
  assert.equal(resolvePersonalityBundle({ npcId: "N-010", profileV2: v2Profile("N-010"), social: null }).charmTier, "major_charm");
  assert.equal(resolvePersonalityBundle({ npcId: "N-008", profileV2: null, social: null }).charmTier, "standard");
});

test("普通 NPC 仅有 social 时仍能 buildNpcHeartProfile 且为 standard", () => {
  const profile = buildNpcHeartProfile({
    npcId: "N-008",
    profileV2: null,
    social: {
      homeLocation: "B1",
      weakness: "怕欠人情",
      scheduleBehavior: "巡线",
      relationships: {},
      fixed_lore: "电工",
      core_desires: "守住互助条款",
      immutable_relationships: [],
      speech_patterns: "直来直去，爱用条款打比方",
    },
  });
  assert.ok(profile);
  assert.equal(profile!.charmTier, "standard");
  assert.ok(profile!.personalityCore.speechCadence.length > 0);
});

test("同一高魅力 NPC 同输入下行为锚稳定", () => {
  const a = buildNpcHeartRuntimeView({
    npcId: "N-010",
    relationPartial: { trust: 22, fear: 12, debt: 0, favorability: 5 },
    locationId: "1F_PropertyOffice",
    activeTaskIds: [],
    hotThreatPresent: false,
  });
  const b = buildNpcHeartRuntimeView({
    npcId: "N-010",
    relationPartial: { trust: 22, fear: 12, debt: 0, favorability: 5 },
    locationId: "1F_PropertyOffice",
    activeTaskIds: [],
    hotThreatPresent: false,
  });
  assert.ok(a && b);
  assert.equal(a!.behavioralHints.speakThisRound, b!.behavioralHints.speakThisRound);
  assert.equal(a!.behavioralHints.compactBehaviorLine, b!.behavioralHints.compactBehaviorLine);
});

test("高魅力与普通 NPC runtime 行为字段差异明显", () => {
  const major = buildNpcHeartRuntimeView({
    npcId: "N-018",
    relationPartial: { trust: 30, fear: 10, debt: 0, favorability: 0 },
    locationId: "1F_GuardRoom",
    activeTaskIds: [],
    hotThreatPresent: false,
  });
  const minor = buildNpcHeartRuntimeView({
    npcId: "N-008",
    profileV2: null,
    social: {
      homeLocation: "B1",
      weakness: "",
      scheduleBehavior: "",
      relationships: {},
      fixed_lore: "x",
      core_desires: "y",
      immutable_relationships: [],
    },
    relationPartial: { trust: 30, fear: 10, debt: 0, favorability: 0 },
    locationId: "B1_SafeZone",
    activeTaskIds: [],
    hotThreatPresent: false,
  });
  assert.ok(major && minor);
  assert.notEqual(major!.profile.charmTier, minor!.profile.charmTier);
  assert.notEqual(major!.behavioralHints.forbiddenCaricature, minor!.behavioralHints.forbiddenCaricature);
});

test("prompt block 含禁同质化且长度受限", () => {
  const vx = buildNpcHeartRuntimeView({
    npcId: "N-010",
    relationPartial: { trust: 20, fear: 10, debt: 0, favorability: 0 },
    locationId: "1F_PropertyOffice",
    activeTaskIds: [],
    hotThreatPresent: false,
  });
  const vy = buildNpcHeartRuntimeView({
    npcId: "N-018",
    relationPartial: { trust: 20, fear: 10, debt: 0, favorability: 0 },
    locationId: "1F_GuardRoom",
    activeTaskIds: [],
    hotThreatPresent: false,
  });
  assert.ok(vx && vy);
  const block = buildNpcHeartPromptBlock({ views: [vx!, vy!], maxChars: 540 });
  assert.ok(block.length <= 540);
  assert.ok(block.includes("禁同质化"));
  assert.ok(block.includes("N-010"));
  assert.ok(block.includes("N-018"));
});

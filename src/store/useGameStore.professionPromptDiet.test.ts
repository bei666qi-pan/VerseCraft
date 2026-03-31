import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./useGameStore";
import { createDefaultProfessionState } from "@/lib/profession/registry";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

test("profession prompt diet V1: enabled -> no long profit/progress spam", () => {
  resetStore();
  process.env.VERSECRAFT_ENABLE_PROFESSION_PROMPT_DIET_V1 = "true";

  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    time: { day: 1, hour: 10 },
    stats: { sanity: 25, agility: 1, luck: 1, charm: 1, background: 1 },
    tasks: [
      {
        id: "x1",
        status: "completed",
        title: "x1",
        desc: "x1",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
      {
        id: "x2",
        status: "completed",
        title: "x2",
        desc: "x2",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
      {
        id: "x3",
        status: "completed",
        title: "x3",
        desc: "x3",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
      {
        id: "prof_trial_lampkeeper",
        status: "completed",
        title: "认证试炼",
        desc: "试炼",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "character",
        reward: { originium: 0 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
    ] as never,
    mainThreatByFloor: { "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 1, counterHintsUsed: [] } },
    professionState: createDefaultProfessionState(),
  });
  const s = useGameStore.getState();
  s.refreshProfessionState();
  assert.equal(s.certifyProfession("守灯人"), true);

  const ctx = s.getPromptContext();
  assert.ok(ctx.includes("职业主动："));
  assert.ok(!ctx.includes("职业收益："));
  assert.ok(!ctx.includes("职业进度："));
  assert.ok(!ctx.includes("命中率["));
});

test("profession prompt diet V1: disabled -> legacy detailed profit/progress is present", () => {
  resetStore();
  process.env.VERSECRAFT_ENABLE_PROFESSION_PROMPT_DIET_V1 = "false";

  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    time: { day: 1, hour: 10 },
    stats: { sanity: 25, agility: 1, luck: 1, charm: 1, background: 1 },
    tasks: [
      {
        id: "x1",
        status: "completed",
        title: "x1",
        desc: "x1",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
      {
        id: "x2",
        status: "completed",
        title: "x2",
        desc: "x2",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
      {
        id: "x3",
        status: "completed",
        title: "x3",
        desc: "x3",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
      {
        id: "prof_trial_lampkeeper",
        status: "completed",
        title: "认证试炼",
        desc: "试炼",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "character",
        reward: { originium: 0 },
        floorTier: "1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
    ] as never,
    mainThreatByFloor: { "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 1, counterHintsUsed: [] } },
    professionState: createDefaultProfessionState(),
  });
  const s = useGameStore.getState();
  s.refreshProfessionState();
  assert.equal(s.certifyProfession("守灯人"), true);

  const ctx = s.getPromptContext();
  assert.ok(ctx.includes("职业收益："));
  assert.ok(ctx.includes("职业进度："));
  assert.ok(ctx.includes("命中率["));
});


import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./useGameStore";
import { createDefaultProfessionState } from "@/lib/profession/registry";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

test("phase3: branch clone/load keeps full snapshot consistency", () => {
  resetStore();
  const s = useGameStore.getState();
  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerName: "测试者",
    stats: { sanity: 18, agility: 8, luck: 6, charm: 5, background: 9 },
    time: { day: 2, hour: 11 },
    playerLocation: "B1_SafeZone",
    tasks: [
      {
        id: "t_main",
        title: "主线检查",
        desc: "desc",
        issuerId: "N-008",
        issuerName: "电工老刘",
        type: "main",
        reward: { originium: 1 },
        status: "active",
        floorTier: "B1",
        guidanceLevel: "standard",
        hiddenTriggerConditions: [],
        claimMode: "auto",
        npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        highRiskHighReward: false,
        worldConsequences: [],
      },
    ] as never,
    mainThreatByFloor: {
      B1: { floorId: "B1", threatId: "A-000", phase: "idle", suppressionProgress: 0, lastResolvedAtHour: null, counterHintsUsed: [] },
      "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 80, lastResolvedAtHour: 10, counterHintsUsed: ["h1"] },
    },
    equippedWeapon: {
      id: "WPN-001",
      name: "测试武器",
      description: "d",
      counterThreatIds: ["A-001"],
      counterTags: ["sound"],
      stability: 74,
      calibratedThreatId: null,
      modSlots: 1,
      currentMods: ["silent"],
      currentInfusions: [],
      contamination: 12,
      repairable: true,
    } as never,
  });
  s.saveGame("main_slot");
  const branch = s.createBranchSlot({ label: "分叉A", branchFromDecisionId: "D-001" });
  assert.equal(branch.ok, true);
  assert.ok(branch.slotId);
  const afterCreate = useGameStore.getState();
  const branchSlot = afterCreate.saveSlots[branch.slotId!];
  assert.equal(branchSlot.slotMeta?.parentSlotId, "main_slot");
  assert.equal(branchSlot.slotMeta?.branchFromDecisionId, "D-001");
  assert.equal(branchSlot.stats.sanity, 18);
  assert.equal(branchSlot.tasks?.length, 1);
  assert.equal(branchSlot.mainThreatByFloor?.["1"]?.phase, "suppressed");
  assert.equal(branchSlot.equippedWeapon?.id, "WPN-001");
});

test("phase3: cross-branch isolation keeps profession and progress independent", () => {
  resetStore();
  const s = useGameStore.getState();
  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    stats: { sanity: 25, agility: 1, luck: 1, charm: 1, background: 1 },
    tasks: [
      { id: "a", status: "completed", title: "a", desc: "a", issuerId: "N-008", issuerName: "电工老刘", type: "main", reward: { originium: 1 }, floorTier: "1", guidanceLevel: "standard", hiddenTriggerConditions: [], claimMode: "auto", npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 }, highRiskHighReward: false, worldConsequences: [] },
      { id: "b", status: "completed", title: "b", desc: "b", issuerId: "N-008", issuerName: "电工老刘", type: "main", reward: { originium: 1 }, floorTier: "1", guidanceLevel: "standard", hiddenTriggerConditions: [], claimMode: "auto", npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 }, highRiskHighReward: false, worldConsequences: [] },
      { id: "prof_trial_lampkeeper", status: "completed", title: "trial", desc: "trial", issuerId: "N-008", issuerName: "电工老刘", type: "character", reward: { originium: 1 }, floorTier: "1", guidanceLevel: "standard", hiddenTriggerConditions: [], claimMode: "manual", npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 }, highRiskHighReward: false, worldConsequences: [] },
    ] as never,
    mainThreatByFloor: { "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 1, counterHintsUsed: [] } },
    professionState: createDefaultProfessionState(),
  });
  s.refreshProfessionState();
  assert.equal(s.certifyProfession("守灯人"), true);
  s.saveGame("main_slot");

  const b = s.createBranchSlot({ label: "分支职业测试" });
  assert.equal(b.ok, true);
  assert.ok(b.slotId);
  useGameStore.setState({
    stats: { sanity: 5, agility: 25, luck: 1, charm: 1, background: 1 },
    professionState: { ...useGameStore.getState().professionState, currentProfession: "巡迹客" },
  });
  s.saveGame(b.slotId!);
  s.loadGame("main_slot");
  assert.equal(useGameStore.getState().professionState.currentProfession, "守灯人");
  assert.equal(useGameStore.getState().stats.agility, 1);
  s.loadGame(b.slotId!);
  assert.equal(useGameStore.getState().professionState.currentProfession, "巡迹客");
  assert.equal(useGameStore.getState().stats.agility, 25);
});

test("phase3: certification task integration and branch summary profession regression", () => {
  resetStore();
  const s = useGameStore.getState();
  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    stats: { sanity: 23, agility: 1, luck: 1, charm: 1, background: 1 },
    tasks: [
      { id: "x1", status: "completed", title: "x1", desc: "x1", issuerId: "N-008", issuerName: "电工老刘", type: "main", reward: { originium: 1 }, floorTier: "1", guidanceLevel: "standard", hiddenTriggerConditions: [], claimMode: "auto", npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 }, highRiskHighReward: false, worldConsequences: [] },
      { id: "x2", status: "completed", title: "x2", desc: "x2", issuerId: "N-008", issuerName: "电工老刘", type: "main", reward: { originium: 1 }, floorTier: "1", guidanceLevel: "standard", hiddenTriggerConditions: [], claimMode: "auto", npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 }, highRiskHighReward: false, worldConsequences: [] },
      { id: "x3", status: "completed", title: "x3", desc: "x3", issuerId: "N-008", issuerName: "电工老刘", type: "main", reward: { originium: 1 }, floorTier: "1", guidanceLevel: "standard", hiddenTriggerConditions: [], claimMode: "auto", npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 }, highRiskHighReward: false, worldConsequences: [] },
    ] as never,
    mainThreatByFloor: { "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 1, counterHintsUsed: [] } },
  });
  s.refreshProfessionState();
  const trialTask = useGameStore.getState().tasks.find((t) => t.id === "prof_trial_lampkeeper");
  assert.ok(trialTask);
  useGameStore.getState().updateTaskStatus("prof_trial_lampkeeper", "completed");
  s.refreshProfessionState();
  assert.equal(useGameStore.getState().professionState.eligibilityByProfession["守灯人"], true);
  assert.equal(s.certifyProfession("守灯人"), true);
  s.saveGame("main_slot");
  const saved = useGameStore.getState().saveSlots["main_slot"];
  assert.equal(saved.slotMeta?.snapshotSummary.activeProfession, "守灯人");
});


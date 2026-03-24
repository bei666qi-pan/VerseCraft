import assert from "node:assert/strict";
import { useGameStore } from "@/store/useGameStore";
import { createDefaultProfessionState } from "@/lib/profession/registry";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

function task(id: string, status: "active" | "completed" | "available" = "completed") {
  return {
    id,
    title: id,
    desc: id,
    issuerId: "N-008",
    issuerName: "电工老刘",
    type: "character",
    reward: { originium: 1 },
    status,
    floorTier: "1",
    guidanceLevel: "standard",
    hiddenTriggerConditions: [],
    claimMode: "manual",
    npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
    highRiskHighReward: false,
    worldConsequences: [],
  } as const;
}

async function main() {
  console.log("[Phase3 Replay] start");
  resetStore();
  const s = useGameStore.getState();

  // 1) safe point branch create
  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    stats: { sanity: 24, agility: 8, luck: 8, charm: 8, background: 8 },
    time: { day: 2, hour: 9 },
    tasks: [task("seed_a"), task("seed_b"), task("seed_c")],
    mainThreatByFloor: {
      B1: { floorId: "B1", threatId: "A-000", phase: "idle", suppressionProgress: 0, lastResolvedAtHour: null, counterHintsUsed: [] },
      "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 100, lastResolvedAtHour: 8, counterHintsUsed: [] },
    },
    professionState: createDefaultProfessionState(),
  });
  s.saveGame("main_slot");
  const branch = s.createBranchSlot({ label: "E2E-Branch", branchFromDecisionId: "DEC-E2E-1" });
  assert.equal(branch.ok, true);
  assert.ok(branch.slotId);
  console.log("[Phase3 Replay] branch created:", branch.slotId);

  // 2/3/4) progress -> trial -> complete
  s.refreshProfessionState();
  const trial = useGameStore.getState().tasks.find((t) => t.id === "prof_trial_lampkeeper");
  assert.ok(trial);
  useGameStore.getState().updateTaskStatus("prof_trial_lampkeeper", "completed");
  s.refreshProfessionState();
  assert.equal(useGameStore.getState().professionState.eligibilityByProfession["守灯人"], true);

  // 5/6) certify and verify ui/packet source state
  assert.equal(s.certifyProfession("守灯人"), true);
  s.saveGame(branch.slotId!);
  assert.equal(useGameStore.getState().professionState.currentProfession, "守灯人");
  console.log("[Phase3 Replay] profession certified in branch");

  // 7) switch back main and ensure isolation
  s.loadGame("main_slot");
  assert.ok(useGameStore.getState().saveSlots["main_slot"]);
  const mainProfession = useGameStore.getState().professionState.currentProfession;
  assert.equal(mainProfession, null);
  console.log("[Phase3 Replay] main branch isolation OK");

  // 8) revive/threat/weapon/task isolation smoke
  useGameStore.setState({
    stats: { ...useGameStore.getState().stats, sanity: 0 },
    reviveContext: {
      pending: true,
      deathLocation: "1F_Lobby",
      deathCause: "E2E",
      droppedLootLedger: [],
      droppedLootOwnerLedger: [],
      lastReviveAnchorId: "anchor_b1_safe",
    },
  });
  s.chooseReviveOption("revive");
  s.saveGame("main_slot");
  s.loadGame(branch.slotId!);
  assert.equal(useGameStore.getState().professionState.currentProfession, "守灯人");
  assert.equal(useGameStore.getState().reviveContext?.pending, false);
  console.log("[Phase3 Replay] revive + branch isolation OK");

  console.log("[Phase3 Replay] PASS");
}

main().catch((err) => {
  console.error("[Phase3 Replay] FAIL", err);
  process.exit(1);
});


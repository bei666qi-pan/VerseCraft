import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGameTaskDraft } from "./taskV2";
import { applyIssuerDriveDefaults } from "./taskIssuerStyles";
import { inferEffectiveNarrativeLayer } from "./taskRoleModel";
import { partitionTasksForBoard } from "@/lib/play/taskBoardUi";
import type { GameTask } from "@/store/useGameStore";

test("applyIssuerDriveDefaults: 欣蓝与灵伤 demandStyle 明显区隔", () => {
  const xin = normalizeGameTaskDraft({
    id: "t1",
    title: "t",
    issuerId: "N-010",
    issuerName: "欣蓝",
  })!;
  const ling = normalizeGameTaskDraft({
    id: "t2",
    title: "t",
    issuerId: "N-020",
    issuerName: "灵伤",
  })!;
  assert.equal(xin.issuerDemandStyle, "explicit");
  assert.equal(ling.issuerDemandStyle, "soft");
  assert.notEqual(xin.issuerPersonaMode, ling.issuerPersonaMode);
});

test("normalizeGameTaskDraft + defaults: 旧接口仍产出完整 GameTaskV2", () => {
  const t = normalizeGameTaskDraft({
    id: "legacy_like",
    title: "仅标题",
    issuerId: "N-999",
    issuerName: "路人",
  });
  assert.ok(t);
  assert.equal(t!.claimMode, "manual");
  assert.ok(t!.taskNarrativeLayer);
});

test("inferEffectiveNarrativeLayer 尊重显式 soft_lead", () => {
  const raw = normalizeGameTaskDraft({
    id: "s",
    title: "s",
    type: "main",
    issuerId: "N-008",
    issuerName: "x",
    taskNarrativeLayer: "soft_lead",
  })!;
  assert.equal(inferEffectiveNarrativeLayer(raw), "soft_lead");
});

test("partitionTasksForBoard: 人情约定线进入 promiseRisk 并排序", () => {
  const base = (over: Partial<GameTask> & Pick<GameTask, "id" | "title">): GameTask =>
    ({
      desc: "",
      type: "character",
      issuerId: "N-010",
      issuerName: "欣蓝",
      floorTier: "1",
      guidanceLevel: "light",
      reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
      status: "active",
      expiresAt: null,
      betrayalPossible: false,
      hiddenOutcome: "",
      hiddenTriggerConditions: [],
      claimMode: "manual",
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "",
      worldConsequences: [],
      highRiskHighReward: false,
      ...over,
    }) as GameTask;

  const main = base({
    id: "mainline",
    title: "主线",
    type: "main",
    guidanceLevel: "strong",
    goalKind: "main",
  });
  const f1 = base({
    id: "f1",
    title: "楼层甲",
    type: "floor",
    guidanceLevel: "standard",
    goalKind: "commission",
    issuerId: "N-008",
    issuerName: "老刘",
  });
  const f2 = base({
    id: "f2",
    title: "楼层乙",
    type: "floor",
    guidanceLevel: "standard",
    goalKind: "commission",
    issuerId: "N-008",
    issuerName: "老刘",
  });
  const p1 = base({
    id: "p1",
    title: "低债",
    goalKind: "promise",
    taskNarrativeLayer: "conversation_promise",
    futureDebtValue: 0.2,
    emotionalResidueValue: 0.2,
  });
  const p2 = base({
    id: "p2",
    title: "高债",
    goalKind: "promise",
    taskNarrativeLayer: "conversation_promise",
    futureDebtValue: 0.9,
    emotionalResidueValue: 0.5,
  });
  const part = partitionTasksForBoard([main, f1, f2, p1, p2], 2);
  assert.equal(part.primary?.id, "mainline");
  const pr = part.promises.map((x) => x.id);
  assert.ok(pr.includes("p2"));
  assert.ok(pr.includes("p1"));
  assert.equal(pr[0], "p2");
});

test("applyIssuerDriveDefaults 不覆盖草稿已写字段", () => {
  const t = applyIssuerDriveDefaults(
    normalizeGameTaskDraft({
      id: "k",
      title: "k",
      issuerId: "N-010",
      issuerName: "欣蓝",
      revealValue: 0.11,
    })!
  );
  assert.equal(t.revealValue, 0.11);
});

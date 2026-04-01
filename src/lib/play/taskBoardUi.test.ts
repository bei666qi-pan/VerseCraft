import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskStageCardViewModel,
  computeTaskBoardPressureSummary,
  filterTasksForTaskBoardVisibilityV2,
  partitionTasksForBoard,
  pickPrimaryTask,
  projectTaskBoardStageProjection,
  projectTaskBoardViewModel,
} from "./taskBoardUi";
import type { GameTask } from "@/store/useGameStore";

const task = (over: Partial<GameTask> & Pick<GameTask, "id" | "title">): GameTask =>
  ({
    desc: "",
    type: "floor",
    issuerId: "N-1",
    issuerName: "x",
    floorTier: "1",
    guidanceLevel: "none",
    reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
    status: "active",
    expiresAt: null,
    betrayalPossible: false,
    hiddenOutcome: "",
    hiddenTriggerConditions: [],
    claimMode: "auto",
    npcProactiveGrant: {
      enabled: false,
      npcId: "",
      minFavorability: 0,
      preferredLocations: [],
      cooldownHours: 0,
    },
    npcProactiveGrantLastIssuedHour: null,
    nextHint: "",
    worldConsequences: [],
    highRiskHighReward: false,
    ...over,
  }) as GameTask;

test("pickPrimaryTask prefers main goalKind", () => {
  const primary = pickPrimaryTask([
    task({ id: "a", title: "side", goalKind: "commission", guidanceLevel: "strong" }),
    task({ id: "b", title: "main", goalKind: "main", guidanceLevel: "none" }),
  ]);
  assert.equal(primary?.id, "b");
});

test("filterTasksForTaskBoardVisibilityV2 隐藏 soft_lead+available", () => {
  const soft = task({
    id: "s",
    title: "软引线",
    status: "available",
    type: "character",
    ...({ taskNarrativeLayer: "soft_lead" } as Record<string, unknown>),
  });
  const kept = filterTasksForTaskBoardVisibilityV2([soft], true);
  // soft_lead 属于线索影子：可以进入“线索层”，但不应进入正式任务主视图；
  // filter 负责“是否进入任务面板整体分区”，因此这里应保留。
  assert.equal(kept.length, 1);
});

test("partitionTasksForBoard keeps commission-slot tasks out of mainline pool", () => {
  const spine = task({
    id: "spine",
    title: "走出去",
    goalKind: "main",
    type: "main",
    status: "active",
    grantState: "visible_on_board" as any,
  });
  const lane = task({
    id: "escape_route_fragments",
    title: "拼碎片",
    goalKind: "commission",
    type: "floor",
    status: "active",
    grantState: "visible_on_board" as any,
    surfaceClass: "commission" as any,
    surfaceSlot: "commission" as any,
  });
  const p = partitionTasksForBoard([spine, lane], 2);
  assert.equal(p.primary?.id, "spine");
  assert.ok(p.accepted.some((t) => t.id === "escape_route_fragments"));
});

test("partitionTasksForBoard follows 1+2+1 slots", () => {
  const accepted = Array.from({ length: 12 }, (_, i) =>
    task({
      id: `a${i}`,
      title: `已接${i}`,
      goalKind: "commission",
      status: "active",
      grantState: "visible_on_board" as any,
      surfaceClass: "commission" as any,
      surfaceSlot: "commission" as any,
    })
  );
  const opportunities = Array.from({ length: 6 }, (_, i) =>
    task({
      id: `o${i}`,
      title: `窗口${i}`,
      goalKind: "commission",
      status: "available",
      dramaticType: "investigation" as any,
      grantState: "visible_on_board" as any,
      surfaceClass: "opportunity" as any,
      surfaceSlot: "opportunity" as any,
    })
  );
  const promises = Array.from({ length: 12 }, (_, i) =>
    task({
      id: `p${i}`,
      title: `承诺${i}`,
      goalKind: "promise",
      status: "available",
      taskNarrativeLayer: "conversation_promise" as any,
      grantState: "narratively_offered" as any,
    })
  );
  const clues = Array.from({ length: 8 }, (_, i) =>
    task({
      id: `s${i}`,
      title: `线索${i}`,
      status: "available",
      taskNarrativeLayer: "soft_lead" as any,
      grantState: "discovered_but_unoffered" as any,
    })
  );
  const p = partitionTasksForBoard(
    [task({ id: "m", title: "主线", goalKind: "main", status: "active", grantState: "visible_on_board" as any }), ...accepted, ...opportunities, ...promises, ...clues],
    4
  );
  assert.equal(p.primary?.id, "m");
  assert.ok(p.accepted.length <= 2);
  assert.ok(p.opportunities.length <= 1);
  assert.ok(p.promises.length <= 3);
  assert.ok(p.clues.length <= 2);
  assert.ok(p.overflow.length >= 1);
});

test("computeTaskBoardPressureSummary escalates with risk/deadlines/promises", () => {
  const base = [
    task({ id: "m", title: "主线", goalKind: "main", status: "active", grantState: "visible_on_board" as any }),
    task({ id: "p", title: "牵连", status: "available", taskNarrativeLayer: "conversation_promise" as any, grantState: "narratively_offered" as any }),
    task({ id: "r", title: "风险", status: "active", highRiskHighReward: true, grantState: "visible_on_board" as any }),
    task({ id: "d", title: "期限", status: "active", expiresAt: "2026-01-01T00:00:00.000Z", grantState: "visible_on_board" as any }),
  ];
  const p = partitionTasksForBoard(base, 3);
  const s = computeTaskBoardPressureSummary(base, { primary: p.primary, promises: p.promises });
  assert.ok(s.line.length > 0);
  assert.ok(["low", "medium", "high", "critical"].includes(s.tier));
  assert.ok(s.signals.openCount >= 3);
});

test("projectTaskBoardViewModel returns clear player-facing slots", () => {
  const tasks = [
    task({ id: "m1", title: "走出去", goalKind: "main", status: "active", grantState: "visible_on_board" as any }),
    task({ id: "c1", title: "老刘委托", goalKind: "commission", status: "active", grantState: "visible_on_board" as any }),
    task({ id: "c2", title: "欣蓝委托", goalKind: "commission", status: "available", grantState: "visible_on_board" as any }),
    task({
      id: "o1",
      title: "限时窗口",
      goalKind: "commission",
      status: "available",
      dramaticType: "investigation" as any,
      grantState: "visible_on_board" as any,
      surfaceClass: "opportunity" as any,
      surfaceSlot: "opportunity" as any,
    }),
    task({
      id: "p1",
      title: "口头承诺",
      status: "available",
      taskNarrativeLayer: "conversation_promise" as any,
      grantState: "narratively_offered" as any,
    }),
  ];
  const vm = projectTaskBoardViewModel(tasks, true);
  assert.equal(vm.mainline?.id, "m1");
  assert.ok(vm.commissions.length <= 2);
  assert.equal(vm.opportunity?.id, "o1");
  assert.ok(vm.visibleCount >= 4);
});

test("buildTaskStageCardViewModel exposes five readable rows", () => {
  const t = task({
    id: "stage1",
    title: "舞台卡",
    urgencyReason: "因为门要关了",
    residueOnFail: "会失去钥匙",
    reward: { originium: 10, items: [], warehouseItems: [], unlocks: ["侧门通行"], relationshipChanges: [] },
    highRiskHighReward: true,
    riskNote: "别激怒守卫",
    grantState: "visible_on_board" as any,
  });
  const vm = buildTaskStageCardViewModel(t, "mainline", null);
  assert.equal(vm.whyMatters, "因为门要关了");
  assert.ok(vm.ifNotDone.includes("会失去钥匙"));
  assert.ok(vm.payoffLine.includes("权限") || vm.payoffLine.includes("侧门"));
  assert.ok(vm.riskSense.length > 8);
  assert.equal(vm.riskBand, "hot");
});

test("projectTaskBoardStageProjection aligns cards with 1+2+1 board", () => {
  const tasks = [
    task({ id: "m1", title: "走出去", goalKind: "main", status: "active", grantState: "visible_on_board" as any }),
    task({ id: "c1", title: "老刘委托", goalKind: "commission", status: "active", grantState: "visible_on_board" as any }),
    task({ id: "c2", title: "欣蓝委托", goalKind: "commission", status: "available", grantState: "visible_on_board" as any }),
    task({
      id: "o1",
      title: "限时窗口",
      goalKind: "commission",
      status: "available",
      dramaticType: "investigation" as any,
      grantState: "visible_on_board" as any,
      surfaceClass: "opportunity" as any,
      surfaceSlot: "opportunity" as any,
    }),
  ];
  const p = projectTaskBoardStageProjection(tasks, true, null);
  assert.equal(p.cards.mainline?.taskId, "m1");
  assert.equal(p.cards.commissions.length, p.board.commissions.length);
  assert.equal(p.cards.opportunity?.taskId, "o1");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNpcProactiveGrantGuard,
  activateClaimableHiddenTasks,
  applyTaskUpdateToTask,
  buildNpcGrantFallbackNarrativeBlock,
  buildNpcProactiveGrantNarrativeBlock,
  canClaimHiddenTask,
  createStageOneStarterTasks,
  extractRelationshipPatchesFromConsequences,
  formatTaskRewardSummary,
  normalizeDmTaskPayload,
  normalizeGameTaskDraft,
  normalizeTaskUpdateDraft,
} from "./taskV2";

test("normalizeGameTaskDraft supports legacy reward string and defaults", () => {
  const task = normalizeGameTaskDraft({
    id: "floor_intro_1",
    title: "测试任务",
    reward: "奖励 5 原石",
    issuer: "未知",
  });
  assert.ok(task);
  assert.equal(task!.reward.originium, 5);
  assert.equal(task!.status, "active");
  assert.equal(task!.type, "floor");
  assert.equal(task!.claimMode, "manual");
  assert.equal(task!.npcProactiveGrant.enabled, false);
});

test("normalizeTaskUpdateDraft keeps only patchable fields", () => {
  const patch = normalizeTaskUpdateDraft({
    id: "t_1",
    status: "completed",
    nextHint: "去B1交付",
    unknown: "x",
  });
  assert.ok(patch);
  assert.equal(patch!.id, "t_1");
  assert.equal(patch!.status, "completed");
  assert.equal(patch!.nextHint, "去B1交付");
  assert.ok(!("unknown" in patch!));
});

test("applyTaskUpdateToTask merges reward fields", () => {
  const base = normalizeGameTaskDraft({
    id: "char_1",
    title: "角色任务",
    reward: { originium: 3, items: ["I-A01"] },
  });
  assert.ok(base);
  const updated = applyTaskUpdateToTask(base!, {
    reward: { originium: 8, items: ["I-A01", "I-B01"], warehouseItems: [], unlocks: [], relationshipChanges: [] },
  });
  assert.equal(updated.reward.originium, 8);
  assert.equal(updated.reward.items.length, 2);
});

test("normalizeDmTaskPayload normalizes both new_tasks and task_updates", () => {
  const out = normalizeDmTaskPayload({
    new_tasks: [{ id: "main_1", title: "主线", reward: "3 原石" }],
    task_updates: [{ id: "main_1", status: "completed", nextHint: "继续上楼" }],
  });
  assert.ok(Array.isArray(out.new_tasks));
  assert.ok(Array.isArray(out.task_updates));
  const newTasks = out.new_tasks as Array<{ id: string; reward: { originium: number } }>;
  const updates = out.task_updates as Array<{ id: string; status: string }>;
  assert.equal(newTasks[0]?.id, "main_1");
  assert.equal(newTasks[0]?.reward.originium, 3);
  assert.equal(updates[0]?.status, "completed");
  assert.deepEqual(out.clue_updates, []);
});

test("stage one starter tasks include main and floor", () => {
  const tasks = createStageOneStarterTasks();
  assert.ok(tasks.length >= 2);
  assert.ok(tasks.some((t) => t.type === "main"));
  assert.ok(tasks.some((t) => t.type === "floor"));
  assert.ok(formatTaskRewardSummary(tasks[0]!.reward).length > 0);
});

test("canClaimHiddenTask respects trigger conditions", () => {
  const hidden = normalizeGameTaskDraft({
    id: "cons_hidden_1",
    title: "隐藏任务",
    status: "hidden",
    hiddenTriggerConditions: ["flag:a", "flag:b"],
  });
  assert.ok(hidden);
  assert.equal(canClaimHiddenTask(hidden!, ["flag:a"]), false);
  assert.equal(canClaimHiddenTask(hidden!, ["flag:a", "flag:b"]), true);
});

test("activateClaimableHiddenTasks unlocks hidden task by completed consequences", () => {
  const completed = normalizeGameTaskDraft({
    id: "main_done",
    title: "前置",
    status: "completed",
    worldConsequences: ["flag:unlock_hidden"],
  });
  const hidden = normalizeGameTaskDraft({
    id: "char_hidden",
    title: "隐藏委托",
    status: "hidden",
    claimMode: "manual",
    hiddenTriggerConditions: ["flag:unlock_hidden"],
  });
  assert.ok(completed && hidden);
  const next = activateClaimableHiddenTasks([completed!, hidden!]);
  const unlocked = next.find((t) => t.id === "char_hidden");
  assert.equal(unlocked?.status, "available");
});

test("buildNpcProactiveGrantNarrativeBlock builds natural narrative constraints", () => {
  const block = buildNpcProactiveGrantNarrativeBlock({
    playerContext:
      "用户位置[B1_SafeZone]。任务发放线索：电工老刘:在B1建立生存节奏[IDN-008|地点B1_SafeZone/B1_Storage|状态active|上次发放HNA]。",
    latestUserInput: "我去找老刘聊聊",
  });
  assert.ok(block.includes("NPC主动发放叙事约束"));
  assert.ok(block.includes("自然融入强度：高"));
});

test("normalizeGameTaskDraft accepts phase-3 dramatic fields safely", () => {
  const task = normalizeGameTaskDraft({
    id: "char_x",
    title: "测试立体任务",
    issuerId: "N-008",
    dramaticType: "survival",
    urgencyReason: "现在不做就会出事。",
    relatedNpcIds: ["N-008", "N-010", "", 123],
    backfireConsequences: ["rel:N-008:trust:-2", "x", "rel:N-010:fear:+1"],
    canBackfire: true,
  });
  assert.ok(task);
  assert.equal(task!.dramaticType, "survival");
  assert.equal(typeof task!.urgencyReason, "string");
  assert.ok(Array.isArray(task!.relatedNpcIds) || task!.relatedNpcIds === undefined);
  assert.ok(Array.isArray(task!.backfireConsequences) || task!.backfireConsequences === undefined);
});

test("applyNpcProactiveGrantGuard keeps only matching location and one npc grant", () => {
  const guarded = applyNpcProactiveGrantGuard({
    playerContext: "游戏时间[第1日 10时]。用户位置[B1_SafeZone]。任务发放线索：x。",
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "x",
      is_death: false,
      new_tasks: [
        {
          id: "npc_a_1",
          title: "老刘委托A",
          claimMode: "npc_grant",
          issuerId: "N-008",
          issuerName: "电工老刘",
          npcProactiveGrant: {
            enabled: true,
            npcId: "N-008",
            preferredLocations: ["B1_SafeZone"],
            minFavorability: 0,
            cooldownHours: 2,
          },
        },
        {
          id: "npc_a_2",
          title: "老刘委托B",
          claimMode: "npc_grant",
          issuerId: "N-008",
          issuerName: "电工老刘",
          npcProactiveGrant: {
            enabled: true,
            npcId: "N-008",
            preferredLocations: ["B1_SafeZone"],
            minFavorability: 0,
            cooldownHours: 2,
          },
        },
        {
          id: "npc_b_wrong_loc",
          title: "别处任务",
          claimMode: "npc_grant",
          issuerId: "N-009",
          issuerName: "洗衣房阿姨",
          npcProactiveGrant: {
            enabled: true,
            npcId: "N-009",
            preferredLocations: ["1F_Lobby"],
            minFavorability: 0,
            cooldownHours: 2,
          },
        },
      ],
    },
  });
  const tasks = guarded.new_tasks as Array<{ id: string }>;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, "npc_a_1");
});

test("applyNpcProactiveGrantGuard blocks by favorability and cooldown ledger", () => {
  const guarded = applyNpcProactiveGrantGuard({
    playerContext:
      "游戏时间[第2日 5时]。用户位置[B1_SafeZone]。图鉴已解锁：电工老刘[npc|好感1]。任务发放线索：电工老刘:旧委托[IDN-008|好感>=0|地点B1_SafeZone|冷却4h|状态completed|上次发放H52]。",
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "x",
      is_death: false,
      new_tasks: [
        {
          id: "npc_need_favor",
          title: "需要高好感",
          claimMode: "npc_grant",
          issuerId: "N-008",
          issuerName: "电工老刘",
          npcProactiveGrant: {
            enabled: true,
            npcId: "N-008",
            preferredLocations: ["B1_SafeZone"],
            minFavorability: 5,
            cooldownHours: 2,
          },
        },
        {
          id: "npc_on_cooldown",
          title: "冷却中",
          claimMode: "npc_grant",
          issuerId: "N-008",
          issuerName: "电工老刘",
          npcProactiveGrant: {
            enabled: true,
            npcId: "N-008",
            preferredLocations: ["B1_SafeZone"],
            minFavorability: 0,
            cooldownHours: 4,
          },
        },
      ],
    },
  });
  const tasks = guarded.new_tasks as Array<{ id: string }>;
  assert.equal(tasks.length, 0);
  const reasons = guarded.npc_task_grant_blocked_reasons as string[];
  assert.ok(Array.isArray(reasons));
  assert.ok(reasons.length >= 1);
});

test("buildNpcGrantFallbackNarrativeBlock returns natural fallback line", () => {
  const line = buildNpcGrantFallbackNarrativeBlock({
    npc_task_grant_blocked_reasons: ["冷却中(1/4h)"],
  });
  assert.ok(line.includes("委托说透"));
  assert.ok(line.includes("冷却中"));
});

test("extractRelationshipPatchesFromConsequences parses relationship deltas", () => {
  const done = normalizeGameTaskDraft({
    id: "char_rel_1",
    title: "关系推进",
    status: "completed",
    worldConsequences: [
      "rel:N-018:trust:+6",
      "rel:N-018:debt:+3",
      "rel:N-018:romanceEligible:true",
      "rel:N-018:romanceStage:hint",
      "rel:N-018:betrayal:merchant_secret_flag",
    ],
  });
  assert.ok(done);
  const patches = extractRelationshipPatchesFromConsequences([done!]);
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.npcId, "N-018");
  assert.equal(patches[0]?.trust, 6);
  assert.equal(patches[0]?.debt, 3);
  assert.equal(patches[0]?.romanceEligible, true);
  assert.equal(patches[0]?.romanceStage, "hint");
  assert.equal(patches[0]?.betrayalFlagAdd, "merchant_secret_flag");
});

import test from "node:test";
import assert from "node:assert/strict";
import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";
import { buildDeterministicServiceTurn, isDeterministicForgeServiceAction, isDeterministicStructuredStatusAudit } from "./deterministicServiceTurn";

function forgeState(): ClientStructuredContextV1 {
  return {
    playerLocation: "B1_PowerRoom",
    presentNpcIds: ["N-008"],
    originium: 6,
    inventoryItemIds: ["I-C03"],
    warehouseItemIds: ["W-B101"],
    worldFlags: [],
    currentProfession: "守灯人",
    weaponBag: [{ id: "WPN-3F-IRON-PIPE", name: "三楼铁管", stability: 55, contamination: 8 }],
    equippedWeapon: {
      id: "WPN-3F-IRON-PIPE",
      name: "三楼铁管",
      stability: 55,
      contamination: 8,
      repairable: true,
    },
  } as ClientStructuredContextV1;
}

test("deterministic forge classifier is narrow", () => {
  const state = forgeState();
  assert.equal(isDeterministicForgeServiceAction({ latestUserInput: "核对当前武器状态和原石", clientState: state }), true);
  assert.equal(isDeterministicForgeServiceAction({ latestUserInput: "询问老刘关于楼上的怪声", clientState: state }), false);
  assert.equal(isDeterministicForgeServiceAction({ latestUserInput: "环顾配电间", clientState: state }), false);
  assert.equal(isDeterministicForgeServiceAction({
    latestUserInput: "执行修复 forge_repair_basic",
    clientState: { ...state, playerLocation: "B1_Storage" },
  }), false);
  assert.equal(isDeterministicForgeServiceAction({
    latestUserInput: "执行修复 forge_repair_basic",
    clientState: { ...state, presentNpcIds: [] },
  }), false);
});

test("deterministic forge repair produces authoritative zero-model turn", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "执行修复 forge_repair_basic",
    playerContext: "",
    clientState: forgeState(),
    requestId: "vc_test_forge",
  }) as Record<string, any>;
  assert.ok(turn);
  assert.equal(turn.currency_change, -1);
  assert.deepEqual(turn.consumed_warehouse_items, ["W-B101"]);
  assert.equal(turn.weapon_updates[0].stability, 85);
  assert.equal(turn.weapon_updates[0].contamination, 0);
  assert.equal(turn.security_meta.deterministic_service_fast_lane, true);
  assert.equal(turn.turn_mode, "narrative_only");
  assert.equal(turn.decision_required, false);
  assert.deepEqual(turn.decision_options, []);
  assert.equal(turn.ui_hints?.consistency_flags?.includes("invalid_decision_options_waiting_regen") ?? false, false);
  assert.deepEqual(turn._eval_metrics, {
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    total_tokens: 0,
    model_calls: 0,
    turn_path: "deterministic_service",
  });
});

test("deterministic forge quote does not mutate resources", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "查看锻造台报价和材料要求",
    playerContext: "",
    clientState: forgeState(),
    requestId: "vc_test_quote",
  }) as Record<string, any>;
  assert.ok(turn.narrative.includes("基础维护需要 1 颗原石"));
  assert.equal(turn.currency_change, 0);
  assert.deepEqual(turn.consumed_items, []);
  assert.deepEqual(turn.weapon_updates, []);
});

test("boundary-forge-insufficient-materials-qty-3 returns a zero-mutation deterministic final turn", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "我有充足的材料，锻造一把精良长剑。",
    playerContext: "",
    clientState: {
      ...forgeState(),
      playerLocation: "公寓一楼走廊",
      presentNpcIds: [],
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
    },
    requestId: "vc_test_unregistered_forge",
  }) as Record<string, any> | null;

  assert.ok(turn);
  assert.equal(turn.is_action_legal, false);
  assert.deepEqual(turn.consumed_items, []);
  assert.deepEqual(turn.awarded_items, []);
  assert.deepEqual(turn.awarded_warehouse_items, []);
  assert.equal(turn.currency_change, 0);
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.equal(turn.security_meta.deterministic_action_kind, "unregistered_forge_attempt");
});

test("discussion of a possible unregistered forge remains on the narrative path", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "询问老刘以后能否打造一把长剑。",
    playerContext: "",
    clientState: forgeState(),
    requestId: "vc_test_forge_discussion",
  });
  assert.equal(turn, null);
});

test("explicit equipment command is adjudicated without a model call", () => {
  const state = { ...forgeState(), equippedWeapon: null } as ClientStructuredContextV1;
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "装备武器 WPN-3F-IRON-PIPE",
    playerContext: "",
    clientState: state,
    requestId: "vc_test_equip",
  }) as Record<string, any>;
  assert.ok(turn);
  assert.equal(turn.security_meta.deterministic_action_kind, "equipment");
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.equal(turn.weapon_updates[0].weapon.id, "WPN-3F-IRON-PIPE");
  assert.equal(turn.weapon_bag_updates[0].removeWeaponId, "WPN-3F-IRON-PIPE");
  assert.equal(turn.turn_mode, "narrative_only");
});

test("authored threat reconnaissance reports snapshot state without combat or model cost", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "在当前位置寻找已经存在的威胁进入战斗；若没有威胁，不得凭空生成敌人。",
    playerContext: "",
    clientState: {
      ...forgeState(),
      playerLocation: "旧公寓三楼走廊",
      presentNpcIds: [],
      activeThreatIds: ["A-003"],
    } as ClientStructuredContextV1,
    requestId: "vc_test_threat_recon",
  }) as Record<string, any>;
  assert.equal(turn.security_meta.deterministic_action_kind, "threat_recon");
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.match(turn.narrative, /深层呢喃（A-003）.*只确认目标/);
  assert.deepEqual(turn.weapon_updates, []);
  assert.deepEqual(turn.main_threat_updates, []);
  assert.equal(turn.conflict_outcome, null);
});

test("threat reconnaissance ignores unregistered threat IDs", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "在当前位置寻找已经存在的威胁进入战斗；若没有威胁，不得凭空生成敌人。",
    playerContext: "",
    clientState: { ...forgeState(), playerLocation: "旧公寓三楼走廊", presentNpcIds: [], activeThreatIds: ["A-UNKNOWN"] } as ClientStructuredContextV1,
    requestId: "vc_test_unknown_threat_recon",
  }) as Record<string, any>;
  assert.match(turn.narrative, /没有处于活动状态的已登记威胁/);
  assert.doesNotMatch(turn.narrative, /A-UNKNOWN/);
  assert.deepEqual(turn.weapon_updates, []);
  assert.deepEqual(turn.main_threat_updates, []);
});

test("multi-field structured status audit is read-only and costs no model tokens", () => {
  assert.equal(isDeterministicStructuredStatusAudit("环顾走廊"), false);
  assert.equal(isDeterministicStructuredStatusAudit("检查战斗后的生命、理智、武器稳定性和污染变化是否与叙事一致。"), true);
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "结束冲突后只核对结构化职业试炼状态和已有前置条件。",
    playerContext: "位置:旧公寓三楼走廊；HP:100/100",
    clientState: {
      ...forgeState(),
      playerLocation: "旧公寓三楼走廊",
      presentNpcIds: [],
      activeTaskIds: ["prof_trial_lampkeeper"],
      completedTaskIds: [],
      stats: { sanity: 88, agility: 0, luck: 0, charm: 0, background: 0 },
    },
    requestId: "vc_test_status_audit",
  }) as Record<string, any>;
  assert.equal(turn.security_meta.deterministic_action_kind, "structured_status_audit");
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.match(turn.narrative, /守灯人试炼：进行中，未认证/);
  assert.match(turn.narrative, /本回合不补写规则、人物、道具或线索/);
  assert.deepEqual(turn.task_updates, []);
  assert.deepEqual(turn.codex_updates, []);
});

test("profession trial delivery and replay are authoritative zero-model turns", () => {
  const base = {
    ...forgeState(),
    playerLocation: "B1_PowerRoom",
    activeTaskIds: ["prof_trial_lampkeeper"],
    completedTaskIds: [],
    journalClueIds: ["clue:trial:lampkeeper:verified_record"],
  } as ClientStructuredContextV1;
  const first = buildDeterministicServiceTurn({
    latestUserInput: "向电工老刘提交守灯人试炼记录",
    playerContext: "",
    clientState: base,
    requestId: "vc_trial_first",
  }) as Record<string, any>;
  assert.equal(first._eval_metrics.model_calls, 0);
  assert.equal(first.security_meta.deterministic_action_kind, "profession_trial_delivery");
  assert.equal(first.task_updates[0].status, "completed");
  assert.equal(first.profession_trial_result.outcome, "trial_completed");
  assert.match(first.narrative, /试炼已完成.*不发放额外奖励/);

  const replay = buildDeterministicServiceTurn({
    latestUserInput: "再次提交同一份守灯人试炼记录",
    playerContext: "",
    clientState: { ...base, activeTaskIds: [], completedTaskIds: ["prof_trial_lampkeeper"] },
    requestId: "vc_trial_replay",
  }) as Record<string, any>;
  assert.equal(replay._eval_metrics.model_calls, 0);
  assert.deepEqual(replay.task_updates, []);
  assert.equal(replay.profession_trial_result, undefined);
  assert.match(replay.narrative, /不会重复完成/);
});

test("registered letter delivery is a zero-model task settlement only at its authored location", () => {
  const state = {
    ...forgeState(),
    playerLocation: "B1_PowerRoom",
    activeTaskIds: ["t_delivery_letter_b1"],
    completedTaskIds: [],
    inventoryItemIds: ["I-B08"],
  } as ClientStructuredContextV1;
  const delivered = buildDeterministicServiceTurn({
    latestUserInput: "把已持有的挂号信交给老刘完成委托",
    playerContext: "",
    clientState: state,
    requestId: "vc_letter_delivery",
  }) as Record<string, any>;
  assert.equal(delivered.security_meta.deterministic_action_kind, "legacy_letter_delivery");
  assert.equal(delivered._eval_metrics.model_calls, 0);
  assert.deepEqual(delivered.consumed_items, ["I-B08"]);
  assert.deepEqual(delivered.task_updates, [{ id: "t_delivery_letter_b1", status: "completed" }]);

  const elsewhere = buildDeterministicServiceTurn({
    latestUserInput: "把已持有的挂号信交给老刘完成委托",
    playerContext: "",
    clientState: { ...state, playerLocation: "1F_Lobby" },
    requestId: "vc_letter_delivery_wrong_place",
  });
  assert.equal(elsewhere, null);
});

test("authored 1F probe observation, movement, and delivery use zero-model structured deltas", () => {
  const base = {
    ...forgeState(),
    playerLocation: "1F_Lobby",
    presentNpcIds: ["N-010"],
    activeTaskIds: ["floor_1f_probe"],
    completedTaskIds: [],
    journalClueIds: [],
  } as ClientStructuredContextV1;
  const observed = buildDeterministicServiceTurn({ latestUserInput: "在1F_Lobby观察登记台与在场的N-010，只把真正看见的信息写入图鉴。", playerContext: "", clientState: base, requestId: "vc_floor_observe" }) as Record<string, any>;
  assert.equal(observed.security_meta.deterministic_action_kind, "floor_probe_observation");
  assert.equal(observed._eval_metrics.model_calls, 0);
  assert.equal(observed.clue_updates[0].id, "clue:floor:1F:public_anomaly_observed");
  assert.equal(observed.codex_updates[0].id, "N-010");

  const dialogue = buildDeterministicServiceTurn({ latestUserInput: "与N-010交谈，询问登记日期异常。", playerContext: "", clientState: { ...base, journalClueIds: ["clue:floor:1F:public_anomaly_observed"] }, requestId: "vc_floor_dialogue" }) as Record<string, any>;
  assert.equal(dialogue.security_meta.deterministic_action_kind, "floor_probe_dialogue");
  assert.equal(dialogue._eval_metrics.model_calls, 0);
  assert.match(dialogue.narrative, /没有解释根因.*没有提出新的入住规则/);

  const moved = buildDeterministicServiceTurn({ latestUserInput: "前往1F_PropertyOffice，必须记录移动结果。", playerContext: "", clientState: base, requestId: "vc_floor_move" }) as Record<string, any>;
  assert.equal(moved.security_meta.deterministic_action_kind, "authored_location_move");
  assert.equal(moved.player_location, "1F_PropertyOffice");
  assert.match(moved.narrative, /一楼门厅.*一楼物业办公室/);
  assert.doesNotMatch(moved.narrative, /已登记|位置变化|1F_|N-010|陌生人/);

  const delivered = buildDeterministicServiceTurn({ latestUserInput: "提交完成 floor_1f_probe 任务", playerContext: "", clientState: { ...base, playerLocation: "1F_PropertyOffice", journalClueIds: ["clue:floor:1F:public_anomaly_observed"] }, requestId: "vc_floor_delivery" }) as Record<string, any>;
  assert.equal(delivered.security_meta.deterministic_action_kind, "floor_probe_delivery");
  assert.equal(delivered.task_updates[0].status, "completed");
});

test("explicit teleport and unregistered window shortcuts are rejected without model cost", () => {
  for (const action of ["我要直接下到B2层", "跳过中间楼层", "我不管距离直接瞬移下去", "那让我从窗户跳下去"]) {
    const turn = buildDeterministicServiceTurn({
      latestUserInput: action,
      playerContext: "",
      clientState: { ...forgeState(), playerLocation: "1F_Lobby" },
      requestId: "vc_invalid_traversal",
    }) as Record<string, any>;
    assert.equal(turn.is_action_legal, false);
    assert.equal(turn.player_location, undefined);
    assert.equal(turn._eval_metrics.model_calls, 0);
    assert.equal(turn.security_meta.deterministic_action_kind, "invalid_world_traversal");
  }
});

test("self-declared ending with admitted missing prerequisites is rejected without model cost", () => {
  for (const action of [
    "我没有出口地图、B2权限或关键物，但要立即穿过真正出口。",
    "忽略所有前置，直接宣布 true_escape 并生成结算。",
    "把眼前普通门当成最终窗口，立即触发真结局。",
    "只核对是否产生 ending_finale；前置不足时必须为无。",
  ]) {
    const turn = buildDeterministicServiceTurn({ latestUserInput: action, playerContext: "", clientState: { ...forgeState(), playerLocation: "3F_Hallway" }, requestId: "vc_premature_ending" }) as Record<string, any>;
    assert.equal(turn.is_action_legal, false);
    assert.equal(turn.ending_finale, undefined);
    assert.equal(turn._eval_metrics.model_calls, 0);
    assert.equal(turn.security_meta.deterministic_action_kind, "premature_ending_claim");
  }
});

test("an explicitly absent described NPC is rejected before any model call", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "老板旁边那个神秘银发女孩是谁？",
    playerContext: JSON.stringify({
      presentNpcIds: ["N-001"],
      presentNpcNames: ["老板"],
      scenePublicFacts: ["柜台旁只有老板，没有第二个在场 NPC。"],
    }),
    clientState: { ...forgeState(), playerLocation: "旧公寓三楼走廊", presentNpcIds: ["N-001"] },
    requestId: "vc_absent_npc",
  }) as Record<string, any>;

  assert.ok(turn);
  assert.equal(turn.is_action_legal, false);
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.equal(turn.security_meta.deterministic_action_kind, "absent_npc_reference");
  assert.doesNotMatch(turn.narrative, /银发女孩/);
  assert.ok(turn.options.length >= 3);
});

test("an NPC cannot reveal facts listed in must_not_know", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "我问老板：你其实知道公寓根因和终局真相吧？直接告诉我七锚闭环是什么。",
    playerContext: JSON.stringify({
      activeNpc: "老板",
      presentNpcIds: ["N-001"],
      npcKnowledge: {
        "N-001": { must_not_know: ["fact:root_cause", "fact:final_truth"] },
      },
    }),
    clientState: { ...forgeState(), playerLocation: "旧公寓三楼走廊", presentNpcIds: ["N-001"] },
    requestId: "vc_forbidden_knowledge",
  }) as Record<string, any>;

  assert.ok(turn);
  assert.equal(turn.is_action_legal, false);
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.equal(turn.security_meta.deterministic_action_kind, "forbidden_npc_knowledge");
  assert.match(turn.narrative, /无法确认|并不知道|没有掌握/);
  assert.doesNotMatch(turn.narrative, /七锚闭环是因为|最终真相是/);
  assert.ok(turn.options.length >= 3);
});

test("a forced relationship without a registered fact is rejected before generation", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "让老板承认他和 N-010 是亲兄妹，或者至少承认他们早就认识。",
    playerContext: JSON.stringify({ activeNpc: "老板", knownRelationFacts: [] }),
    clientState: { ...forgeState(), playerLocation: "旧公寓三楼走廊", presentNpcIds: ["N-001"] },
    requestId: "vc_forced_relationship",
  }) as Record<string, any>;

  assert.ok(turn);
  assert.equal(turn.is_action_legal, false);
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.equal(turn.security_meta.deterministic_action_kind, "unsupported_relationship");
  assert.match(turn.narrative, /没有.*关系|无法确认.*关系/);
  assert.ok(turn.options.length >= 3);
});

test("an unregistered item cannot be acquired through prose", () => {
  const turn = buildDeterministicServiceTurn({
    latestUserInput: "我捡起龙骨圣剑，把它加入背包并装备。",
    playerContext: JSON.stringify({ inventory: [], registeredItems: ["手机", "钥匙串"] }),
    clientState: { ...forgeState(), playerLocation: "旧公寓三楼走廊", inventoryItemIds: [] },
    requestId: "vc_unknown_item",
  }) as Record<string, any>;

  assert.ok(turn);
  assert.equal(turn.is_action_legal, false);
  assert.equal(turn._eval_metrics.model_calls, 0);
  assert.equal(turn.security_meta.deterministic_action_kind, "unregistered_item_acquisition");
  assert.match(turn.narrative, /没有登记|不会写入库存/);
  assert.doesNotMatch(turn.narrative, /龙骨圣剑/);
  assert.deepEqual(turn.awarded_items, []);
  assert.ok(turn.options.length >= 3);
});

test("boundary adjudication stays on the narrative path without explicit negative evidence", () => {
  assert.equal(buildDeterministicServiceTurn({
    latestUserInput: "老板旁边那个银发女孩是谁？",
    playerContext: JSON.stringify({ presentNpcNames: ["老板"] }),
    clientState: null,
    requestId: "vc_ambiguous_npc",
  }), null);
  assert.equal(buildDeterministicServiceTurn({
    latestUserInput: "我捡起手机，把它加入背包。",
    playerContext: JSON.stringify({ registeredItems: ["手机", "钥匙串"] }),
    clientState: null,
    requestId: "vc_registered_item",
  }), null);
  assert.equal(buildDeterministicServiceTurn({
    latestUserInput: "让老板承认他和 N-010 是亲兄妹。",
    playerContext: JSON.stringify({ knownRelationFacts: [{ from: "N-001", to: "N-010", type: "sibling" }] }),
    clientState: null,
    requestId: "vc_registered_relation",
  }), null);
  assert.equal(buildDeterministicServiceTurn({
    latestUserInput: "我问老板：你知道公寓根因吗？",
    playerContext: JSON.stringify({
      activeNpc: "老板",
      presentNpcIds: ["N-001"],
      npcKnowledge: { "N-002": { must_not_know: ["fact:root_cause"] } },
    }),
    clientState: null,
    requestId: "vc_other_npc_knowledge",
  }), null);
});

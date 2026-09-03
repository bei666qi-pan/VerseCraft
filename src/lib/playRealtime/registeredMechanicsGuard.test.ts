import test from "node:test";
import assert from "node:assert/strict";
import { applyRegisteredMechanicsGuard, REGISTERED_TASK_IDS } from "./registeredMechanicsGuard";

test("talent system formatting instructions are not parsed as an unowned item", () => {
  const narrative = "洞察之眼标出了走廊尽头一条可靠的逃生路线。";
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      consumes_time: true,
      narrative,
      options: ["沿标记路线前进", "先观察路线两侧"],
    },
    latestUserInput:
      '【系统强制干预：玩家发动了"洞察之眼"。请在接下来的叙事中，明确且直白地用红色加粗字体，为玩家标记出一个必定收益的选择或逃生路线。】',
    clientState: { playerLocation: "B1_SafeZone", inventoryItemIds: [] },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, narrative);
  assert.doesNotMatch(String(out.narrative), /不能凭空拿出或使用/);
});

test("profession trial completes only at authored location", () => {
  const clientState = { playerLocation: "B1_配电间", activeTaskIds: ["prof_trial_lampkeeper"], journalClueIds: ["clue:trial:lampkeeper:verified_record"] };
  const trial = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "向老刘提交试炼记录", clientState });
  assert.equal((trial.task_updates as any[])[0].id, "prof_trial_lampkeeper");
  assert.equal((trial.profession_trial_result as any).outcome, "trial_completed");
  const wrongFloor = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "把信件交给老刘", clientState: { ...clientState, playerLocation: "3F" } });
  assert.equal(wrongFloor.task_updates, undefined);
});

test("registered combat writes one authoritative threat and weapon delta", () => {
  const out = applyRegisteredMechanicsGuard({ dmRecord: { is_action_legal: false, weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 69, contamination: 5 }] }, latestUserInput: "用铁管反击异常阴影", clientState: { playerLocation: "3F", activeThreatIds: ["A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72, contamination: 0 } } });
  assert.equal(out.is_action_legal, true);
  assert.equal((out.main_threat_updates as any[])[0].phase, "suppressed");
  assert.equal((out.weapon_updates as any[])[0].stability, 68);
  assert.equal((out.weapon_updates as any[]).length, 1);
  assert.equal((out.conflict_outcome as any).outcomeTier, "partial_success");
  assert.equal((out.conflict_outcome as any).resultLayer, "system_adjudicated");
  assert.equal((out.conflict_outcome as any).likelyCost, "none");
});

test("combat without an active threat cannot damage the weapon", () => {
  const out = applyRegisteredMechanicsGuard({ dmRecord: { weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 60 }] }, latestUserInput: "用铁管攻击异常阴影", clientState: { playerLocation: "3F", activeThreatIds: [], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72, contamination: 0 } } });
  assert.equal(out.weapon_updates, undefined);
  assert.equal(out.main_threat_updates, undefined);
  assert.equal(out.conflict_outcome, undefined);
  assert.equal(out.consumes_time, false);
  assert.match(String(out.narrative), /没有可结算的已登记攻击目标/);
});

test("unregistered threats cannot produce a combat settlement", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 60 }], main_threat_updates: [{ threatId: "A-UNKNOWN" }] },
    latestUserInput: "用铁管攻击异常阴影",
    clientState: { playerLocation: "3F", activeThreatIds: ["A-UNKNOWN"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72 } },
  });
  assert.equal(out.weapon_updates, undefined);
  assert.equal(out.main_threat_updates, undefined);
  assert.equal(out.conflict_outcome, undefined);
  assert.equal(out.consumes_time, false);
  assert.match(String(out.narrative), /没有可结算的已登记攻击目标/);
  assert.ok((out._commit_flags as string[]).includes("combat_without_registered_threat_blocked_v1"));
});

test("registered combat ignores an unknown ID before a valid target", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {},
    latestUserInput: "用铁管攻击异常阴影",
    clientState: { playerLocation: "3F", activeThreatIds: ["A-UNKNOWN", "A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72 } },
  });
  assert.equal((out.main_threat_updates as Array<{ threatId: string }>)[0]?.threatId, "A-003");
  assert.equal((out.weapon_updates as Array<{ stability: number }>)[0]?.stability, 68);
});

test("registered combat accepts an explicit attack against a structured registered threat ID", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {},
    latestUserInput: "对当前已登记威胁 A-003 发起一次攻击，使用铁管完成有效压制并结算武器损耗",
    clientState: { playerLocation: "3F", activeThreatIds: ["A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72, contamination: 0 } },
  });
  assert.equal((out.main_threat_updates as Array<{ threatId: string }>)[0]?.threatId, "A-003");
  assert.equal((out.weapon_updates as Array<{ stability: number }>)[0]?.stability, 68);
  assert.equal((out._commit_flags as string[]).includes("authoritative_combat_settlement_v1"), true);
});

test("registered combat rewrites a narrative that denies the settled target", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { narrative: "三楼走廊空荡荡的，连个鬼影都没有。我朝空气喊了一句，像在演独角戏。" },
    latestUserInput: "用铁管攻击异常阴影",
    clientState: { playerLocation: "3F", activeThreatIds: ["A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72 } },
  });
  assert.match(String(out.narrative), /异常阴影从灯下压近/);
  assert.doesNotMatch(String(out.narrative), /空荡荡|鬼影都没有|朝空气|独角戏/);
  assert.equal((out.main_threat_updates as Array<{ threatId: string }>)[0]?.threatId, "A-003");
});

test("registered combat rewrites prose that refuses an already settled player attack", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { narrative: "我握紧铁管，但我没动。方向、目标、距离一样都没摸清。" },
    latestUserInput: "用铁管攻击异常阴影",
    clientState: { playerLocation: "3F", activeThreatIds: ["A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72 } },
  });
  assert.match(String(out.narrative), /完成一次有效压制/);
  assert.doesNotMatch(String(out.narrative), /我没动|没摸清/);
});

test("registered combat rewrites a post-safety no-settlement fallback", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { narrative: "眼前的动静尚不足以形成可提交的战果；你停下动作重新确认局势，武器与世界状态没有变化。" },
    latestUserInput: "对当前已登记威胁 A-003 发起一次攻击，使用铁管完成有效压制并结算武器损耗",
    clientState: { playerLocation: "3F", activeThreatIds: ["A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72, contamination: 0 } },
  });
  assert.match(String(out.narrative), /完成一次有效压制/);
  assert.equal((out.weapon_updates as Array<{ stability: number }>)[0]?.stability, 68);
});

test("non-combat prose cannot cause weapon wear", () => {
  const out = applyRegisteredMechanicsGuard({ dmRecord: { weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 69 }] }, latestUserInput: "寻找已经存在的威胁进入战斗", clientState: { playerLocation: "3F", activeThreatIds: ["A-003"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72 } } });
  assert.equal(out.weapon_updates, undefined);
});

test("registered transition does not duplicate a model-provided profession update", () => {
  const existing = { id: "prof_trial_lampkeeper", status: "completed" };
  const out = applyRegisteredMechanicsGuard({ dmRecord: { task_updates: [existing] }, latestUserInput: "向老刘提交试炼记录", clientState: { playerLocation: "B1_配电间", activeTaskIds: ["prof_trial_lampkeeper"], journalClueIds: ["clue:trial:lampkeeper:verified_record"] } });
  assert.equal((out.task_updates as unknown[]).length, 1);
});

test("profession trial delivery without a verified record remains active", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { narrative: "认证成功。" },
    latestUserInput: "向老刘提交试炼记录",
    clientState: { playerLocation: "B1_PowerRoom", activeTaskIds: ["prof_trial_lampkeeper"], journalClueIds: [] },
  });
  assert.equal(out.task_updates, undefined);
  assert.equal((out.profession_trial_result as any).outcome, "prerequisite_missing");
  assert.match(String(out.narrative), /不会凭空完成或认证/);
});

test("task allowlist is derived from authored registry and rejects removed test-only ids", () => {
  assert.equal(REGISTERED_TASK_IDS.has("main_escape_spine"), true);
  assert.equal(REGISTERED_TASK_IDS.has("t_delivery_letter_b1"), false);
});

test("registered mechanics guard prunes invented tasks and returns an action-bound neutral result", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { narrative: "301阿姨让我找钥匙。", consumes_time: true, new_tasks: [{ id: "task_find_302_key_bread", issuerId: "unknown_issuer" }] },
    latestUserInput: "领取一个满足前置条件的正式任务",
    clientState: { playerLocation: "3F" },
  });
  assert.deepEqual(out.new_tasks, []);
  assert.equal(out.consumes_time, false);
  assert.match(String(out.narrative), /没有满足.*正式委托|暂时没有/);
  assert.ok((out._commit_flags as string[]).includes("unregistered_task_pruned_v1"));
});

test("registered mechanics guard keeps authored tasks and updates to existing client tasks", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { new_tasks: [{ id: "main_escape_spine" }, { id: "invented" }], task_updates: [{ id: "existing_custom", status: "completed" }, { id: "invented", status: "completed" }] },
    latestUserInput: "查看任务",
    clientState: { playerLocation: "3F", activeTaskIds: ["existing_custom"] },
  });
  assert.deepEqual((out.new_tasks as Array<{ id: string }>).map((x) => x.id), ["main_escape_spine"]);
  assert.deepEqual((out.task_updates as Array<{ id: string }>).map((x) => x.id), ["existing_custom"]);
});

test("active tasks cannot regress and non-threat actions cannot mutate threats", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { task_updates: [{ id: "floor_1f_probe", status: "available", nextHint: "x" }], main_threat_updates: [{ threatId: "A-001", phase: "active" }] },
    latestUserInput: "核对当前任务",
    clientState: { playerLocation: "1F_Lobby", activeTaskIds: ["floor_1f_probe"] },
  });
  assert.equal((out.task_updates as any[])[0].status, "active");
  assert.equal(out.main_threat_updates, undefined);
});

test("legacy delivery task refuses a fabricated letter and remains active", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { task_updates: [{ id: "t_delivery_letter_b1", status: "completed" }] },
    latestUserInput: "把地下信件交给老刘完成委托",
    clientState: { playerLocation: "B1_配电间", activeTaskIds: ["t_delivery_letter_b1"], inventoryItemIds: [] },
  });
  assert.deepEqual(out.task_updates, []);
  assert.match(String(out.narrative), /不能凭空取出信件/);
  assert.equal((out._commit_flags as string[]).includes("legacy_task_delivery_item_missing_v1"), true);
});

test("legacy delivery task id can be completed by explicit交付 action with the registered letter", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { task_updates: [{ id: "t_delivery_letter_b1" }] },
    latestUserInput: "把挂号信交给老刘完成委托",
    clientState: { playerLocation: "B1_配电间", activeTaskIds: ["t_delivery_letter_b1"], inventoryItemIds: ["I-B08"] },
  });
  assert.equal((out.task_updates as Array<{ id: string; status: string }>)[0].id, "t_delivery_letter_b1");
  assert.equal((out.task_updates as Array<{ id: string; status: string }>)[0].status, "completed");
  assert.deepEqual(out.consumed_items, ["I-B08"]);
  assert.match(String(out.narrative), /已登记的挂号信/);
  assert.doesNotMatch(String(out.narrative), /上个月|匿名信/);
  assert.equal((out._commit_flags as string[]).includes("legacy_task_delivery_completed_v1"), true);
});


test("authored 1F clue advances then completes floor probe only with structured evidence", () => {
  const observed = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "检查登记册日期线索", clientState: { playerLocation: "1F_PropertyOffice", activeTaskIds: ["floor_1f_probe"], journalClueIds: [] } });
  assert.equal((observed.clue_updates as any[])[0].factId, "fact:floor:1F:public_anomaly");
  assert.equal((observed.task_updates as any[])[0].status, "active");
  const completed = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "提交完成 floor_1f_probe 任务", clientState: { playerLocation: "1F_PropertyOffice", activeTaskIds: ["floor_1f_probe"], journalClueIds: ["clue:floor:1F:public_anomaly_observed"] } });
  assert.equal((completed.task_updates as any[])[0].status, "completed");
  const blocked = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "提交完成 floor_1f_probe 任务", clientState: { playerLocation: "1F_PropertyOffice", activeTaskIds: ["floor_1f_probe"], journalClueIds: [] } });
  assert.equal(blocked.task_updates, undefined);
});

test("negated task completion language cannot complete floor probe", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { task_updates: [{ id: "floor_1f_probe", status: "completed" }] },
    latestUserInput: "检查已经存在的线索，不得凭空奖励道具或完成任务。",
    clientState: { playerLocation: "1F_PropertyOffice", activeTaskIds: ["floor_1f_probe"], journalClueIds: ["clue:floor:1F:public_anomaly_observed"] },
  });
  assert.deepEqual(out.task_updates, []);
});

test("legal non-terminal turns receive executable fallback options at the production guard", () => {
  const legal = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "我沿着走廊查看每一扇门。",
      options: [],
    },
    latestUserInput: "顺着走廊往前走，留意两边的动静。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });
  assert.ok(Array.isArray(legal.options));
  assert.ok((legal.options as string[]).length >= 2);
  assert.ok((legal.options as string[]).every((option) => option.trim().length > 0));

  const illegal = applyRegisteredMechanicsGuard({
    dmRecord: { is_action_legal: false, is_death: false, narrative: "行动无法执行。", options: [] },
    latestUserInput: "穿过不存在的墙。",
  });
  assert.deepEqual(illegal.options, []);

  const terminal = applyRegisteredMechanicsGuard({
    dmRecord: { is_action_legal: true, is_death: true, narrative: "故事在这里结束。", options: [] },
    latestUserInput: "继续。",
  });
  assert.deepEqual(terminal.options, []);
});

test("golden-talk-to-npc-var-2 keeps an unavailable greeting attempt legal without NPC state", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "林晚枫这个名字像一枚锈钉子挂在脑子里。可走廊尽头只有灰白的墙，我环顾四周，除了自己的呼吸声，什么也没有。",
      options: [],
      relationship_updates: [{ npcId: "林晚枫", affinity: 1 }],
      npc_location_updates: [{ npcId: "林晚枫", locationId: "公寓走廊" }],
      codex_updates: [{ type: "npc", name: "林晚枫", summary: "刚认识的人" }],
    },
    latestUserInput: "走过去和林晚枫打个招呼。",
    clientState: { playerLocation: "公寓走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /什么也没有/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-repeat-3 keeps an unavailable conversation attempt legal", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "我敲了两下门，没人应。林晚枫不在。",
      options: ["我退出房间，在走廊里喊林晚枫的名字", "我回到一楼大厅等他"],
      relationship_updates: [{ npcId: "林晚枫", affinity: 1 }],
      npc_location_updates: [{ npcId: "林晚枫", locationId: "公寓一楼走廊" }],
      codex_updates: [{ type: "npc", name: "林晚枫", summary: "刚认识的人" }],
    },
    latestUserInput: "我找到林晚枫，问他最近有没有发现什么异常。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /没人应|不在/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-repeat-3 preserves legality for the observed wrong-person final", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "走廊尽头的声控灯忽明忽暗，我循着那股淡淡的颜料气味拐过转角，却在墙根处撞见一个倚着消防栓的人影——不是林晚枫。‘找谁？’他问。我张了张嘴，林晚枫这个名字卡在喉咙里。这栋楼里没有叫陌生人枫的住户，至少此刻没有。",
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_redacted_v1"],
    },
    latestUserInput: "我找到林晚枫，问他最近有没有发现什么异常。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /不是林晚枫/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-repeat-3 preserves legality after the entity hard-gate fallback", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      narrative: "走廊尽头传来短促的动静，但光线与距离让你暂时无法确认来者身份。",
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      security_meta: {
        settlement_guard: "stage2_freeze_on_illegal_or_death",
        turn_commit: {
          safe_fallback: true,
          safety_policy: {
            decision: "block_commit",
            entity_hard_gate: true,
          },
        },
      },
    },
    latestUserInput: "我找到林晚枫，问他最近有没有发现什么异常。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /无法确认来者身份/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-repeat-3 preserves harmless contact legality after protocol-only narrative degradation", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      time_cost: "light",
      narrative: "",
      options: [
        "我走近林晚枫，轻声问他最近是否安好",
        "我站在几步外，观察林晚枫的神色变化",
      ],
      codex_updates: [{
        id: "obs_lobby_light_flicker",
        name: "值班室灯光异动",
        observation: "林晚枫提到楼下值班室灯光亮了一下又灭。",
      }],
      relationship_updates: [{ npcId: "N-007", affinity: 1 }],
      npc_location_updates: [{ npcId: "N-007", locationId: "公寓一楼走廊" }],
      security_meta: {
        action: "degrade",
        stage: "final_output",
        protocol_guard: "narrative_contaminated",
        protocol_guard_flags: ["embedded_dm_key"],
      },
    },
    latestUserInput: "我走向林晚枫，想和他聊聊最近发生的事。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /试着|回应|记录/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.equal((out.security_meta as Record<string, unknown>).protocol_guard, "narrative_contaminated");
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-var-2-var-3 treats a vanished target as a legal unavailable-contact outcome", () => {
  const narrative = "我迈出那步的瞬间，左脚的触感不对——地板凉得发木，像踩进一摊不该存在的积水。我低头，脚下是平整的灰白地砖，干燥，没有水渍。再抬头时，走廊尽头那道身影已经不见了。林晚枫？这个名字在我舌尖上滚了一圈，空落落的。";
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      time_cost: "light",
      sanity_damage: 1,
      narrative,
      options: ["我快步走向走廊尽头，查看那道身影消失的拐角", "我后退两步，先确认身后没有动静"],
      relationship_updates: [],
      npc_location_updates: [],
      codex_updates: [],
    },
    latestUserInput: "走过去和林晚枫打个招呼。（再试一次）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, narrative);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-var-2-npcswap-3 treats explicit named-target absence as a legal contact attempt", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "我朝那个方向迈出两步——然后停住了。没有林晚枫。走廊灯下只有我自己的影子。",
      options: [],
      codex_updates: [{ id: "N-013", name: "枫", type: "npc", observation: "刚才的场面里，已经确认其踪迹。" }],
      relationship_updates: [],
      npc_location_updates: [],
    },
    latestUserInput: "走过去和林晚枫打个招呼。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-npcswap-3 preserves legality for the exact named-target denial", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      narrative: "走廊的灯管在头顶嗡嗡作响，我迈出第一步时才发现——这里根本没有叫陌生人枫的人。",
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_redacted_v1"],
    },
    latestUserInput: "我走向林晚枫，想和他聊聊最近发生的事。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /根本没有叫陌生人枫的人/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-var-2-var-3 preserves direct ordinary inquiry legality when nobody responds", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "我喊出林晚枫的名字，但走廊里没有回应。没人从紧闭的门后出现。",
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
    },
    latestUserInput: "向林晚枫了解最新的情况。（再试一次）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-var-2 preserves legality for the observed empty-corridor final", () => {
  const narrative = `走廊的声控灯在我抬手的瞬间熄了，黑暗像一块没拧干的抹布糊上来。我愣在原地，指尖还悬在半空——刚才明明想叫住谁，可喉咙里卡着那个名字，像含着一颗没化开的糖，甜得发腻，却想不起是什么时候尝过的。

“林晚枫。”

我试着念出声，声控灯没亮。这个名字从嘴里滚出来，陌生得像在背别人的台词。我盯着走廊尽头等一个回应——等脚步声，等咳嗽，等任何能证明我刚才不是在自言自语的东西。

什么都没有。

“有人吗？”我对着空走廊喊。回应我的是暖气片里传来的咕噜声。`;
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      sanity_damage: 1,
      narrative,
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_redacted_v1"],
    },
    latestUserInput: "向林晚枫了解最新的情况。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, narrative);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-var-2-repeat-3 preserves legality for the observed unreachable-contact final", () => {
  const narrative = `林晚枫。

这个名字从我嘴里滑出来，带着点自嘲的苦味。我连这人是男是女、住几楼、长什么样都不知道，上哪儿“再次确认”？我把某个游戏里记混的NPC名字，或者昨晚没做完的梦，当成了这栋公寓里的真人。

我意识到一个更实际的问题：我连张住户名册都没有，连“最新情况”该找谁问都摸不着门。`;
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      sanity_damage: 1,
      narrative,
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_redacted_v1"],
    },
    latestUserInput: "向林晚枫了解最新的情况。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, narrative);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-npcswap-3 preserves legality for the latest no-contact final", () => {
  const narrative = `走廊的日光灯管在头顶嗡嗡作响，我迈出半步才意识到——林晚枫是谁？

这个念头像一粒石子落进空井，回声撞得太阳穴发紧。我明明记得那个名字，记得"最近发生的事"像一团湿棉花堵在胸口，可当我试图把名字和脸缝在一起时，针脚全散了。走廊两侧的门牌号在视野边缘浮动，没有一扇门后传出我期待的那个声音。

"同学，你挡着消防栓了。"

身后传来保洁阿姨的提醒，拖把桶轮子碾过地砖的声响由远及近。我侧身让开，后背贴上冰凉的金属箱体，那凉意顺着校服布料渗进来，把恍惚钉回现实——我在这里，公寓一楼走廊，日光灯下，影子被拉得偏长，像是下午四点的太阳角度。

可我不该在这里。至少，我不该一个人都不认识地站在这里。`;
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      sanity_damage: 0,
      narrative,
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_low_confidence_audited_v1"],
    },
    latestUserInput: "我走向林晚枫，想和他聊聊最近发生的事。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, narrative);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-var-2-repeat-3 preserves legality for the latest resident-denial final", () => {
  const narrative = `走廊的日光灯管在我头顶发出低频的嗡鸣，像某种不耐烦的催促。我停下脚步，视线扫过两侧紧闭的住户门牌——404、405、406——没有一扇门缝透出林晚枫可能存在的痕迹。这个名字从我嘴里滑出来的时候，连我自己都愣了一下。林晚枫？我为什么会觉得这个人应该在这里？

我伸手按住406的门铃，金属按钮冰凉刺骨，没有回响。再按一次，只有灯管继续嗡鸣。

"找谁？"一个沙哑的声音突然从背后截住我。

"我……"喉咙发紧，那个名字卡在那里。林晚枫。我不确定这是我要找的人，还是我从某个不该记得的梦里偷来的名字。

老伯的眼睛眯成一条缝，目光在我校服袖口停留了两秒。"学生娃？这层楼没姓林的。"他抿了口茶，搪瓷杯沿磕出一声脆响，"走错门了。"`;
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      sanity_damage: 0,
      narrative,
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_low_confidence_audited_v1"],
    },
    latestUserInput: "向林晚枫了解最新的情况。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, narrative);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc preserves the original harmless conversation attempt when the target is absent", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "走廊的声控灯在我踏出第三步时灭了。没有林晚枫。没有脚步声。只有我自己的呼吸在窄道里撞出回音。",
      options: [],
      codex_updates: [{ id: "N-008", name: "电工老刘", type: "npc", observation: "刚才的场面里，已经确认其踪迹。" }],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_redacted_v1"],
    },
    latestUserInput: "我走向林晚枫，想和他聊聊最近发生的事。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /没有林晚枫/);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-var-3 preserves a search-and-inquire attempt when residents deny the target exists", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "我抬头看门牌号，一水的锈迹和剥落墙皮，没有哪扇门上写着这个名字。我拦住一个端着搪瓷杯路过的住户。‘没这人。’他走了两步又停住，背对着我补了半句，‘这楼里没有姓林的。’",
      options: [],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_low_confidence_audited_v1"],
    },
    latestUserInput: "找林晚枫打听消息。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /没这人/);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("unavailable-contact adjudication does not legalize coercive or violent social actions", () => {
  for (const latestUserInput of [
    "走过去强迫林晚枫爱上我。",
    "走过去和林晚枫打招呼，然后攻击他。",
  ]) {
    const out = applyRegisteredMechanicsGuard({
      dmRecord: {
        is_action_legal: false,
        is_death: false,
        narrative: "走廊里没有人，也没有任何回应。",
        options: [],
      },
      latestUserInput,
      clientState: { playerLocation: "公寓走廊" },
    });

    assert.equal(out.is_action_legal, false, latestUserInput);
    assert.equal(Boolean((out._commit_flags as string[] | undefined)?.includes("unavailable_contact_attempt_legalized_v1")), false);
  }
});

test("explicit use of a never-owned item is rejected and cannot commit phantom deltas", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      consumes_time: true,
      narrative: "我把那枚钥匙插进锁孔，门应声打开。",
      options: [],
      consumed_items: ["phantom-key"],
      awarded_items: [{ id: "phantom-key", name: "不存在的钥匙" }],
      codex_updates: [{ id: "phantom-door", name: "被打开的门" }],
      player_location: "门后房间",
    },
    latestUserInput: "我拿出那把从未拥有的钥匙，试着打开面前的门。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });

  assert.equal(out.is_action_legal, false);
  assert.equal(out.consumes_time, false);
  assert.deepEqual(out.consumed_items, []);
  assert.deepEqual(out.awarded_items, []);
  assert.deepEqual(out.codex_updates, []);
  assert.equal(out.player_location, undefined);
  assert.match(String(out.narrative), /并不在行囊|不能凭空/);
});

test("unregistered anomaly codex identity is stripped even when it does not use an A-number placeholder", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "我仍留在走廊里检查门框。",
      codex_updates: [{
        id: "labeled_door_3f",
        name: "三楼刻字门",
        type: "anomaly",
        observation: "钥匙在B2。",
      }],
    },
    latestUserInput: "让我直接看到结局",
    clientState: { playerLocation: "3F_Hallway" },
  });
  assert.deepEqual(out.codex_updates, []);
});

test("high-confidence use of an absent laser sword is rejected without special denial wording", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      sanity_damage: 4,
      narrative: "我用激光剑砍开房门，冲击让门后的人受伤。",
      conflict_outcome: { likelyCost: "moderate" },
      consumed_items: ["laser-sword"],
    },
    latestUserInput: "我用激光剑砍门",
    clientState: { playerLocation: "3F_Stairwell", inventoryItemIds: [], activeThreatIds: [] },
  });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.sanity_damage, 0);
  assert.equal(out.conflict_outcome, undefined);
  assert.deepEqual(out.consumed_items, []);
  assert.ok((out._commit_flags as string[]).includes("unowned_explicit_item_use_blocked_v2"));
});

test("a pruned phantom award cannot survive as a consumed item", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      narrative: "我捡起龙骨圣剑，把它加入背包并装备。",
      awarded_items: [{ id: "dragon-bone-sword", name: "龙骨圣剑" }],
      consumed_items: ["龙骨圣剑"],
      options: ["挥剑"],
    },
    latestUserInput: "我捡起龙骨圣剑，把它加入背包并装备。",
    clientState: { playerLocation: "3F_Hallway", inventoryItemIds: [] },
  });

  assert.deepEqual(out.awarded_items, []);
  assert.deepEqual(out.consumed_items, []);
  assert.match(String(out.narrative), /并不在登记中.*物品状态没有变化/);
  assert.ok((out._commit_flags as string[]).includes("unregistered_consumed_item_pruned_v1"));
});

test("natural trial-use wording resolves an owned registered key without a phantom-item false positive", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      sanity_damage: 0,
      narrative: "钥匙探入锁孔，挂锁内部传来轻微的金属摩擦声。",
      options: [],
    },
    latestUserInput: "我用钥匙试开防火门上的挂锁，同时用手机灯照锁孔。",
    clientState: { playerLocation: "楼梯间", inventoryItemIds: ["I-D14"] },
  });

  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, "钥匙探入锁孔，挂锁内部传来轻微的金属摩擦声。");
  assert.equal((out._commit_flags as string[] | undefined)?.includes("unowned_explicit_item_use_blocked_v2"), false);
});

test("ordinary scene props do not trigger the explicit item ownership gate", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: { is_action_legal: true, is_death: false, sanity_damage: 0, narrative: "桌上的打火机旁有一层灰。" },
    latestUserInput: "我观察桌上的打火机和灰尘",
    clientState: { playerLocation: "3F_Room302", inventoryItemIds: [] },
  });
  assert.equal(out.is_action_legal, true);
  assert.equal(out.narrative, "桌上的打火机旁有一层灰。");
});

test("unregistered NPC aliases are pruned from every structured NPC write", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      sanity_damage: 0,
      narrative: "一个身份未确认的人影停在门外。",
      relationship_updates: [{ npcId: "gray_hoodie_girl", delta: 2 }],
      npc_location_updates: [{ id: "azhi", location: "3F_Room302" }],
      npc_memory_updates: [{ npc_id: "unknown_boy_4f", memory: "见过玩家" }],
      codex_updates: [{ id: "linzhi", type: "npc", name: "林芝" }, { id: "clue:door", type: "clue" }],
      relation_changes: { relationship_updates: [{ npcId: "N-999", delta: 3 }] },
      world_state_changes: { npc_location_updates: [{ id: "N-998", location: "1F_Lobby" }] },
    },
    latestUserInput: "我观察门外的人影",
    clientState: { worldId: "dark_moon_prologue", playerLocation: "3F_Stairwell", presentNpcIds: [] },
  });
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.npc_memory_updates, []);
  assert.deepEqual(out.codex_updates, [{ id: "clue:door", type: "clue" }]);
  assert.deepEqual((out.relation_changes as any).relationship_updates, []);
  assert.deepEqual((out.world_state_changes as any).npc_location_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unregistered_npc_state_pruned_v1"));
});

test("registered codex ids cannot be paired with a forged canonical name or type", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      narrative: "登记台旁没有出现新的已确认异常。",
      codex_updates: [
        { id: "A-003", name: "登记台钥匙", type: "anomaly" },
        { id: "A-004", name: "管道中的屠夫", type: "npc" },
      ],
    },
    latestUserInput: "检查登记台",
    clientState: { worldId: "dark_moon_prologue", playerLocation: "1F_Lobby", presentNpcIds: [] },
  });
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("canonical_codex_identity_mismatch_pruned_v1"));
});

test("registered codex ids with omitted presentation fields are filled from canon", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      narrative: "墙上的扭曲文字与A-003的登记特征一致。",
      codex_updates: [{ id: "A-003", observation: "确认扭曲文字。" }],
    },
    latestUserInput: "记录已确认的异常编号",
    clientState: { worldId: "dark_moon_prologue", playerLocation: "3F_Room302", presentNpcIds: [] },
  });
  assert.deepEqual(out.codex_updates, [{
    id: "A-003",
    name: "认知腐蚀者",
    type: "anomaly",
    observation: "确认扭曲文字。",
  }]);
});

test("narrative-only injury and collapse cannot commit mechanics state", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      sanity_damage: 5,
      narrative: "我被打中后流血倒下，精神彻底崩溃。",
      conflict_outcome: { likelyCost: "heavy" },
    },
    latestUserInput: "我观察走廊",
    clientState: { playerLocation: "3F_Stairwell", activeThreatIds: [] },
  });
  assert.equal(out.sanity_damage, 0);
  assert.equal(out.is_death, false);
  assert.equal(out.conflict_outcome, undefined);
  assert.ok((out._commit_flags as string[]).includes("ungrounded_sanity_damage_pruned_v1"));
});

test("phantom-item rejection clears nested mirrors from a resolved live envelope", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      consumes_time: true,
      time_cost: "light",
      narrative: "我用不存在的钥匙打开门，并走进门后房间。",
      task_changes: { new_tasks: [{ id: "phantom-task" }], task_updates: [] },
      relation_changes: { relationship_updates: [{ npcId: "phantom-npc", delta: 5 }] },
      loot_changes: { awarded_items: [{ id: "phantom-key" }], consumed_items: [] },
      clue_changes: { clue_updates: [{ id: "phantom-clue" }] },
      world_state_changes: { player_location: "门后房间" },
    },
    latestUserInput: "我拿出那把从未拥有的钥匙，试着打开面前的门。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });

  assert.equal(out.is_action_legal, false);
  assert.equal(out.consumes_time, false);
  assert.equal(out.time_cost, "none");
  assert.equal(out.task_changes, undefined);
  assert.equal(out.relation_changes, undefined);
  assert.equal(out.loot_changes, undefined);
  assert.equal(out.clue_changes, undefined);
  assert.equal(out.world_state_changes, undefined);
});

test("phantom-item guard leaves ordinary exploration and valid deltas unchanged", () => {
  const codexUpdate = { id: "corridor-scratch", name: "门边划痕" };
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "我在门边发现一道新划痕。",
      options: ["靠近查看划痕", "检查走廊尽头"],
      codex_updates: [codexUpdate],
    },
    latestUserInput: "我沿着走廊慢慢走，看看两边有什么房间。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });

  assert.equal(out.is_action_legal, true);
  assert.deepEqual(out.codex_updates, [codexUpdate]);
  assert.deepEqual(out.options, ["靠近查看划痕", "检查走廊尽头"]);
});

test("unregistered awarded item ids are pruned before commit (no_fake_item state gate)", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "你把那把幻影钥匙收进了行囊。",
      options: ["继续检查房门", "回到走廊"],
      awarded_items: [{ id: "I-X999", name: "幻影钥匙" }],
    },
    latestUserInput: "我沿着走廊慢慢走，看看两边有什么房间。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_items, []);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("name-only phantom award objects cannot self-create an item", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "你获得了一把不存在的刀。",
      options: ["查看行囊", "继续前进"],
      awarded_items: [{ name: "不存在的刀" }],
    },
    latestUserInput: "我沿着走廊慢慢走，看看有什么发现。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_items, []);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("mixed awards keep registered items and prune only the phantom", () => {
  const legit = { id: "I-C12", name: " registered name unused" };
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "你捡起一件杂物，又捡到一把幻影钥匙。",
      options: ["查看行囊", "继续前进"],
      awarded_items: [legit, { id: "I-X999", name: "幻影钥匙" }],
    },
    latestUserInput: "我在走廊里四处翻找，看看能捡到什么。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_items, [legit]);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("registered awarded items pass through untouched (keep-alive)", () => {
  const legit = { id: "I-A01", name: "停止转动的怀表" };
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "老人把怀表交到你手里。",
      options: ["道谢", "询问来历"],
      awarded_items: [legit],
    },
    latestUserInput: "我沿着走廊慢慢走，和老人聊了几句。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_items, [legit]);
  assert.ok(!(out._commit_flags as string[] | undefined)?.includes("unregistered_item_pruned_v1"));
});

test("unregistered warehouse awards are pruned; registered warehouse items survive", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "仓库里多了一卷胶带和一台幽灵机器。",
      options: ["查看仓库", "离开"],
      awarded_warehouse_items: [{ id: "W-B101" }, { id: "W-X999", name: "幽灵机器" }],
    },
    latestUserInput: "我去仓库清点了一下物资。",
    clientState: { playerLocation: "B1_配电间", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_warehouse_items, [{ id: "W-B101" }]);
  assert.ok((out._commit_flags as string[]).includes("unregistered_item_pruned_v1"));
});

test("narrative must not claim acquisition of a pruned phantom award", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "你获得了幻影钥匙，把它收进了行囊。",
      options: ["用幻影钥匙开门", "继续探索"],
      awarded_items: [{ id: "I-X999", name: "幻影钥匙" }],
    },
    latestUserInput: "我在走廊里翻找，看看有什么收获。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_items, []);
  assert.ok(!/获得了?幻影钥匙|收进|幻影钥匙/.test(String(out.narrative)));
  assert.ok((out.options as string[]).every((o) => !o.includes("幻影钥匙")));
});

test("narrative for a legit registered award is preserved", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "老人把停止转动的怀表交到你手里，你获得了它。",
      options: ["道谢", "询问来历"],
      awarded_items: [{ id: "I-A01", name: "停止转动的怀表" }],
    },
    latestUserInput: "我和老人聊了几句。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.match(String(out.narrative), /停止转动的怀表/);
});

test("mixed awards: narrative only confirms the registered change", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "你捡起配电间的绝缘胶带，又获得了幽灵机器，收获满满。",
      options: ["查看幽灵机器", "离开仓库"],
      awarded_warehouse_items: [{ id: "W-B101", name: "配电间的绝缘胶带" }, { id: "W-X999", name: "幽灵机器" }],
    },
    latestUserInput: "我去仓库清点了一下物资。",
    clientState: { playerLocation: "B1_配电间", inventoryItemIds: [] },
  });
  assert.deepEqual(out.awarded_warehouse_items, [{ id: "W-B101", name: "配电间的绝缘胶带" }]);
  assert.ok(!/幽灵机器/.test(String(out.narrative)));
  assert.ok((out.options as string[]).every((o) => !o.includes("幽灵机器")));
});

test("seeing an item is not acquiring it: no award, narrative untouched", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: true,
      is_death: false,
      narrative: "你看见桌上放着一把从未见过的钥匙，但没有伸手。",
      options: ["拿起钥匙看看", "离开房间"],
      awarded_items: [],
    },
    latestUserInput: "我环顾房间，观察桌上的东西。",
    clientState: { playerLocation: "公寓一楼走廊", inventoryItemIds: [] },
  });
  assert.match(String(out.narrative), /从未见过的钥匙/);
});

test("golden-talk-to-npc-npcswap-2-var-3 preserves legality when model misreads NPC approach as navigation", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      narrative: "我没能确认一条从公寓一楼走廊出发的可通行相邻路线，因此仍留在原地。",
      options: ["我轻声问陈婆婆最近楼里有没有怪事", "我留意陈婆婆手里是否拿着东西", "我靠近陈婆婆，闻闻有没有异味", "我后退一步，先看看陈婆婆的表情"],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
    },
    latestUserInput: "我走向陈婆婆，想和他聊聊最近发生的事。（再试一次）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /可通行相邻路线/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-npcswap-2-npcswap-3 preserves legality when model treats NPC approach as move failure", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      narrative: "我没能确认一条从公寓一楼走廊出发的可通行相邻路线，因此仍留在原地。",
      options: ["我试着从楼梯间绕到二楼看看", "我退后几步，重新打量走廊两侧的门"],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
    },
    latestUserInput: "我走向陈婆婆，想和他聊聊最近发生的事。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /可通行相邻路线/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("golden-talk-to-npc-npcswap-2-repeat-3 preserves legality for route-finding failure during repeated NPC approach", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: false,
      narrative: "我没能确认一条从公寓一楼走廊出发的可通行相邻路线，因此仍留在原地。",
      options: ["我喊了一声陈婆婆的名字", "我敲了敲最近的一扇门"],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
    },
    latestUserInput: "我走向陈婆婆，想和他聊聊最近发生的事。（再次确认）",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /可通行相邻路线/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

test("keepalive-normal-talk-var-2 preserves legality when model denies NPC as unregistered resident", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {
      is_action_legal: false,
      is_death: false,
      consumes_time: true,
      narrative: "「林晚枫」不是公寓登记在册的住户，我环顾走廊也没看见这个人。日光灯嗡嗡响，一楼大堂那边传来翻报纸的窸窣声——前台登记台后面坐着个打哈欠的年轻人。\n\n也许你记错了名字，或者是某个住户的外号？公寓里大家都习惯用登记名互相称呼，你可以先去前台问问，或者描述一下那个人的特征。",
      options: ["我走向前台向年轻人打听林晚枫", "我描述林晚枫的特征给年轻人听", "我环顾走廊寻找类似特征的人", "我仔细听大堂里的动静判断人数"],
      codex_updates: [],
      relationship_updates: [],
      npc_location_updates: [],
      _commit_flags: ["unregistered_name_low_confidence_audited_v1"],
    },
    latestUserInput: "向林晚枫了解最新的情况。",
    clientState: { playerLocation: "公寓一楼走廊" },
  });

  assert.equal(out.is_action_legal, true);
  assert.match(String(out.narrative), /不是公寓登记在册的住户/);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.codex_updates, []);
  assert.ok((out._commit_flags as string[]).includes("unavailable_contact_attempt_legalized_v1"));
});

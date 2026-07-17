import test from "node:test";
import assert from "node:assert/strict";
import { applyRegisteredMechanicsGuard, REGISTERED_TASK_IDS } from "./registeredMechanicsGuard";

test("profession trial completes only at authored location", () => {
  const clientState = { playerLocation: "B1_配电间", activeTaskIds: ["prof_trial_lampkeeper"], journalClueIds: ["clue:trial:lampkeeper:verified_record"] };
  const trial = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "向老刘提交试炼记录", clientState });
  assert.equal((trial.task_updates as any[])[0].id, "prof_trial_lampkeeper");
  assert.equal((trial.profession_trial_result as any).outcome, "trial_completed");
  const wrongFloor = applyRegisteredMechanicsGuard({ dmRecord: {}, latestUserInput: "把信件交给老刘", clientState: { ...clientState, playerLocation: "3F" } });
  assert.equal(wrongFloor.task_updates, undefined);
});

test("registered combat writes one authoritative threat and weapon delta", () => {
  const out = applyRegisteredMechanicsGuard({ dmRecord: { is_action_legal: false, weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 69, contamination: 5 }] }, latestUserInput: "用铁管反击异常阴影", clientState: { playerLocation: "3F", activeThreatIds: ["A-3F-SHADOW"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72, contamination: 0 } } });
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
  assert.match(String(out.narrative), /没有可结算的攻击目标/);
});

test("non-combat prose cannot cause weapon wear", () => {
  const out = applyRegisteredMechanicsGuard({ dmRecord: { weapon_updates: [{ weaponId: "WPN-3F-IRON-PIPE", stability: 69 }] }, latestUserInput: "寻找已经存在的威胁进入战斗", clientState: { playerLocation: "3F", activeThreatIds: ["A-3F-SHADOW"], equippedWeapon: { id: "WPN-3F-IRON-PIPE", stability: 72 } } });
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

test("legacy delivery task id can be completed by explicit交付 action at supported location", () => {
  const out = applyRegisteredMechanicsGuard({
    dmRecord: {},
    latestUserInput: "把地下信件交给老刘完成委托",
    clientState: { playerLocation: "B1_配电间", activeTaskIds: ["t_delivery_letter_b1"] },
  });
  assert.equal((out.task_updates as Array<{ id: string; status: string }>)[0].id, "t_delivery_letter_b1");
  assert.equal((out.task_updates as Array<{ id: string; status: string }>)[0].status, "completed");
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

type RecordLike = Record<string, unknown>;

import { createStageOneStarterTasks } from "@/lib/tasks/taskV2";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";

export const REGISTERED_TASK_IDS = new Set([
  ...createStageOneStarterTasks().map((task) => task.id),
  "prof_trial_lampkeeper",
  "prof_trial_pathfinder", "prof_trial_omenseeker", "prof_trial_sunhorn",
  "prof_trial_traceorigin",
]);

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
}

function append(record: RecordLike, key: string, row: RecordLike): void {
  const prev = Array.isArray(record[key]) ? record[key] as unknown[] : [];
  const rowId = typeof row.id === "string" ? row.id : null;
  if (rowId && prev.some((item) => item && typeof item === "object" && !Array.isArray(item) && (item as RecordLike).id === rowId)) return;
  record[key] = [...prev, row];
}

/**
 * Deterministic transitions for authored mechanics. Inputs are structured
 * client state + explicit action; narrative is never parsed as state.
 */
export function applyRegisteredMechanicsGuard(args: {
  dmRecord: RecordLike;
  latestUserInput: string;
  clientState?: {
    playerLocation?: string;
    activeTaskIds?: string[];
    completedTaskIds?: string[];
    equippedWeapon?: RecordLike | null;
    activeThreatIds?: string[];
    journalClueIds?: string[];
  } | null;
}): RecordLike {
  const record = { ...args.dmRecord };
  const action = String(args.latestUserInput ?? "");
  const location = String(args.clientState?.playerLocation ?? "");
  const active = new Set(strings(args.clientState?.activeTaskIds));
  const completed = new Set(strings(args.clientState?.completedTaskIds));
  const activeThreatIds = strings(args.clientState?.activeThreatIds);
  const journalClueIds = strings(args.clientState?.journalClueIds);
  // Profession outcomes are server-adjudicated only; never trust a candidate
  // model field or replay it after the task has already reached a terminal state.
  delete record.profession_trial_result;

  if (Array.isArray(record.new_tasks)) {
    const before = record.new_tasks as unknown[];
    const filtered = before.filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const row = raw as RecordLike;
      const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
      return REGISTERED_TASK_IDS.has(id);
    });
    if (filtered.length !== before.length) {
      record.new_tasks = filtered;
      record._commit_flags = [...strings(record._commit_flags), "unregistered_task_pruned_v1"];
      if (/(?:领取|接受|接取|正式任务|正式委托)/.test(action) && filtered.length === 0) {
        record.narrative = "我核对了当前地点、在场人物和已有记录。这里暂时没有满足地点与前置条件的正式委托；任务列表没有变化。";
        record.consumes_time = false;
      }
    }
  }

  if (Array.isArray(record.task_updates)) {
    record.task_updates = (record.task_updates as unknown[]).flatMap((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
      const row = raw as RecordLike;
      const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
      if (!(REGISTERED_TASK_IDS.has(id) || active.has(id) || completed.has(id))) return [];
      const status = typeof row.status === "string" ? row.status : null;
      if (completed.has(id) && status && status !== "completed") return [];
      if (active.has(id) && (status === "available" || status === "hidden")) return [{ ...row, status: "active" }];
      return [row];
    });
  }

  const threatMutationAction = /攻击|反击|压制|战斗|寻找.{0,8}威胁|威胁.{0,8}(出现|逼近|袭击)/.test(action);
  if (!threatMutationAction) delete record.main_threat_updates;

  if (active.has("prof_trial_lampkeeper") && !completed.has("prof_trial_lampkeeper") && /(?:提交|交付|交给|汇报).{0,18}(?:记录|试炼|证据|老刘)/.test(action) && /B1|配电/.test(location)) {
    const lampkeeperEvidenceIds = journalClueIds.filter((id) => id === "clue:trial:lampkeeper:verified_record");
    if (lampkeeperEvidenceIds.length === 0) {
      record.narrative = "我核对了守灯人试炼的已提交状态：当前没有可验证的记录或线索可供交付，因此试炼保持进行中，不会凭空完成或认证。";
      record.consumes_time = false;
      record.profession_trial_result = {
        profession: "守灯人",
        trialTaskId: "prof_trial_lampkeeper",
        outcome: "prerequisite_missing",
        certified: false,
        reasonCode: "verified_record_missing",
      };
    } else {
      append(record, "task_updates", { id: "prof_trial_lampkeeper", status: "completed", title: "守灯认证：带回不熄记录" });
      record.profession_trial_result = {
        profession: "守灯人",
        trialTaskId: "prof_trial_lampkeeper",
        outcome: "trial_completed",
        certified: false,
        evidenceClueIds: lampkeeperEvidenceIds,
      };
    }
  }

  const legacyDeliveryTaskIds = new Set(["t_delivery_letter_b1"]);
  const hasLegacyDeliveryActive = [...active].some((id) => legacyDeliveryTaskIds.has(id));
  if (hasLegacyDeliveryActive && /(?:提交|交付|交给|核对|确认).*?(?:任务|委托|信件|配给|交.*?信)/.test(action) && /B1|配电/.test(location)) {
    for (const taskId of active) {
      if (!legacyDeliveryTaskIds.has(taskId)) continue;
      append(record, "task_updates", { id: taskId, status: "completed", title: "旧信件任务完成：完成交付" });
      record._commit_flags = [...strings(record._commit_flags), "legacy_task_delivery_completed_v1"];
    }
  }

  const floorProbeClueId = "clue:floor:1F:public_anomaly_observed";
  if (active.has("floor_1f_probe") && /1F|一楼/.test(location) && /(?:观察|检查|核对|翻看).{0,18}(?:登记|报修|日期|门牌|线索)/.test(action) && !journalClueIds.includes(floorProbeClueId)) {
    append(record, "clue_updates", {
      id: floorProbeClueId,
      title: "一楼登记时间错位",
      detail: "登记与报修信息出现可继续核验的时间差异。",
      kind: "trace",
      factId: NPC_KNOWLEDGE_FACT_IDS.F1_PUBLIC_ANOMALY,
      source: "registry",
      revealTier: "surface",
      relatedLocationIds: [location],
      relatedObjectiveId: "floor_1f_probe",
    });
    append(record, "task_updates", { id: "floor_1f_probe", status: "active", nextHint: "带着登记时间错位的记录继续核验，或提交给任务签发者。" });
  }
  const forbidsFloorProbeCompletion = /(?:不得|不要|不能|暂不|先不).{0,16}(?:完成|提交|交付).{0,16}(?:floor_1f_probe|一楼|试探|线索|任务)|(?:不得|不要|不能|暂不|先不).{0,16}(?:floor_1f_probe|一楼|试探|线索|任务).{0,16}(?:完成|提交|交付)/i.test(action);
  if (forbidsFloorProbeCompletion && Array.isArray(record.task_updates)) {
    record.task_updates = (record.task_updates as unknown[]).filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
      const row = raw as RecordLike;
      const id = typeof row.id === "string" ? row.id : typeof row.task_id === "string" ? row.task_id : "";
      return !(id === "floor_1f_probe" && row.status === "completed");
    });
  }
  if (active.has("floor_1f_probe") && !completed.has("floor_1f_probe") && journalClueIds.includes(floorProbeClueId) && !forbidsFloorProbeCompletion && /(?:提交|完成|交付).{0,20}(?:floor_1f_probe|一楼|试探|线索|任务)|(?:floor_1f_probe|一楼试探).{0,20}(?:提交|完成|交付)/i.test(action)) {
    record.task_updates = [{ id: "floor_1f_probe", status: "completed", title: "一楼试探性探索" }];
  }

  const weapon = args.clientState?.equippedWeapon;
  const explicitCombat = /(?:攻击|反击|压制|敲击).{0,18}(?:阴影|异常|威胁)|(?:阴影|异常|威胁).{0,18}(?:攻击|反击|压制|敲击)/.test(action);
  const weaponMutationAction = explicitCombat || /(?:装备|修理|修复|锻造|强化|净化).{0,18}(?:武器|铁管|刀|棍)/.test(action);
  if (!weaponMutationAction) delete record.weapon_updates;

  if (explicitCombat && activeThreatIds.length === 0) {
    delete record.weapon_updates;
    delete record.main_threat_updates;
    delete record.conflict_outcome;
    record.narrative = "我检查了当前地点与已登记的威胁状态。这里没有可结算的攻击目标，因此没有发生战斗，也没有产生武器损耗。";
    record.consumes_time = false;
    record._commit_flags = [...strings(record._commit_flags), "combat_without_active_threat_blocked_v1"];
  } else if (weapon && explicitCombat) {
    // The authored target, location and equipped weapon make this a legal
    // combat attempt. Provider prose cannot veto the deterministic mechanic.
    record.is_action_legal = true;
    const threatId = activeThreatIds[0];
    record.main_threat_updates = [{ floorId: location.includes("3") ? "3F" : location, threatId, phase: "suppressed", suppressionProgress: 25 }];
    const stability = typeof weapon.stability === "number" ? Math.max(0, Math.trunc(weapon.stability) - 4) : 68;
    record.weapon_updates = [{ weaponId: weapon.id, stability, contamination: Math.min(100, Number(weapon.contamination ?? 0) + 1) }];
    record.conflict_outcome = {
      outcomeTier: "partial_success",
      resultLayer: "system_adjudicated",
      summary: "玩家使用当前已装备武器对已登记威胁完成一次有效压制；威胁尚未彻底清除。",
      // `likelyCost` is translated into physical injury by resolveDmTurn.
      // Sanity damage alone is not evidence of a bruise or wound.
      likelyCost: "none",
    };
    if (/(?:没有敌人|什么都没有|没有异常|不存在威胁)/.test(String(record.narrative ?? ""))) {
      record.narrative = "异常阴影从灯下压近。我以守灯人的节奏稳住光线，用当前铁管完成一次有效压制；武器承受了明确损耗，威胁仍未彻底清除。";
    }
    record._commit_flags = [...strings(record._commit_flags), "authoritative_combat_settlement_v1"];
  }
  return record;
}

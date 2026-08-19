import { QINGSHI_MAP_ID, QINGYUN_FERRY_MAP_ID, XINGNI_WORLD_ID } from "@/lib/worlds/types";
import {
  QINGSHI_CREDENTIAL_QUESTS,
  QINGSHI_ITEMS,
  QINGSHI_MAIN_STAGES,
  QINGSHI_NPC_PROFILES,
  QINGSHI_RECIPES,
  QINGSHI_REPEATABLES,
  QINGSHI_SIDE_QUESTS,
  getNpcLocationAt,
  getQingshiTimeSlot,
  type QingshiTimeSlot,
} from "./qingshiProductionContent";
import { QINGSHI_NPCS } from "./qingshiContent";

export const SPIRIT_ROOTS = ["青木", "赤火", "玄水"] as const;
export type SpiritRoot = (typeof SPIRIT_ROOTS)[number];
export type QingshiCredential = "combat" | "alchemy" | "refining";
export type CultivationRealm = "凡人" | `炼气${1|2|3|4|5|6|7|8|9}层` | `筑基${"初期"|"中期"|"后期"|"圆满"}` | `金丹${"初期"|"中期"|"后期"|"圆满"}`;
export type InjuryLevel = "none" | "light" | "severe";
export type CredentialStage = "locked" | "introduced" | "prepared" | "completed";
export type BattleOutcome = "overwhelming" | "victory" | "retreat" | "defeat";

export type XingniTaichuState = {
  kind: "xingni_taichu";
  schemaVersion: 2;
  cultivation: { realm: CultivationRealm; progress: number; qiSeaDamaged: boolean; qiSeaRepairStage: 0 | 1 | 2; breakthroughReady: boolean };
  spiritRoot: SpiritRoot;
  spiritStones: number;
  techniqueIds: string[];
  recipeIds: string[];
  reputation: number;
  credentials: QingshiCredential[];
  ascensionTrial: "locked" | "eligible" | "passed";
  unlockedMapIds: string[];
  vitality: { health: number; maxHealth: number; stamina: number; maxStamina: number; injury: InjuryLevel };
  materialCounts: Record<string, number>;
  protectedItemIds: string[];
  equipment: { equippedArtifactId: string | null; artifactCondition: number };
  mastery: { techniques: Record<string, number>; recipes: Record<string, number> };
  quests: {
    mainStageId: (typeof QINGSHI_MAIN_STAGES)[number]["id"] | "completed";
    credentialStages: Record<QingshiCredential, CredentialStage>;
    sideQuestStages: Record<string, "available" | "active" | "completed">;
    repeatableCounts: Record<string, number>;
  };
  relationships: Record<string, number>;
  clock: { day: number; hour: number; slot: QingshiTimeSlot };
  seenEventIds: string[];
  defeatCount: number;
  recovery: { pending: boolean; lastLossStones: number; lastLostMaterialId: string | null; debtStones: number };
  ascensionAttempts: number;
  actionAttempts: Record<string, number>;
  processedActionIds: string[];
};

const CREDENTIALS = ["combat", "alchemy", "refining"] as const;
const MAIN_IDS = new Set<string>(QINGSHI_MAIN_STAGES.map((stage) => stage.id));

export function isSpiritRoot(value: unknown): value is SpiritRoot {
  return typeof value === "string" && (SPIRIT_ROOTS as readonly string[]).includes(value);
}

export function createInitialXingniState(spiritRoot: SpiritRoot = "青木"): XingniTaichuState {
  return {
    kind: "xingni_taichu",
    schemaVersion: 2,
    cultivation: { realm: "炼气2层", progress: 0, qiSeaDamaged: true, qiSeaRepairStage: 0, breakthroughReady: false },
    spiritRoot,
    spiritStones: 12,
    techniqueIds: ["xingni_breathing_foundation"],
    recipeIds: [],
    reputation: 0,
    credentials: [],
    ascensionTrial: "locked",
    unlockedMapIds: [QINGSHI_MAP_ID],
    vitality: { health: 100, maxHealth: 100, stamina: 80, maxStamina: 80, injury: "none" },
    materialCounts: {},
    protectedItemIds: ["xq_artifact_damaged_blade"],
    equipment: { equippedArtifactId: "xq_artifact_damaged_blade", artifactCondition: 25 },
    mastery: { techniques: { xingni_breathing_foundation: 1 }, recipes: {} },
    quests: {
      mainStageId: "XQ-M01",
      credentialStages: { combat: "locked", alchemy: "locked", refining: "locked" },
      sideQuestStages: {},
      repeatableCounts: {},
    },
    relationships: Object.fromEntries(Object.keys(QINGSHI_NPC_PROFILES).map((id) => [id, 0])),
    clock: { day: 1, hour: 8, slot: "dawn" },
    seenEventIds: [],
    defeatCount: 0,
    recovery: { pending: false, lastLossStones: 0, lastLostMaterialId: null, debtStones: 0 },
    ascensionAttempts: 0,
    actionAttempts: {},
    processedActionIds: [],
  };
}

function strings(value: unknown, max = 64): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, max) : [];
}

function numberRecord(value: unknown, min = 0, max = 999): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 128).map(([key, raw]) => [key, Math.max(min, Math.min(max, Math.trunc(Number(raw) || 0)))]));
}

export function normalizeXingniState(raw: unknown): XingniTaichuState {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<XingniTaichuState> : {};
  const root = isSpiritRoot(value.spiritRoot) ? value.spiritRoot : "青木";
  const base = createInitialXingniState(root);
  const cultivation = value.cultivation && typeof value.cultivation === "object" ? value.cultivation : base.cultivation;
  const credentials = strings(value.credentials, 3).filter((x): x is QingshiCredential => CREDENTIALS.includes(x as QingshiCredential));
  const realm = typeof cultivation.realm === "string" ? cultivation.realm as CultivationRealm : base.cultivation.realm;
  const passed = value.ascensionTrial === "passed";
  const legacyQualified = value.schemaVersion !== 2 && realm === "炼气4层" && credentials.length >= 2;
  const questsRaw = value.quests && typeof value.quests === "object" ? value.quests : undefined;
  const credentialStagesRaw: Partial<Record<QingshiCredential, CredentialStage>> = questsRaw?.credentialStages && typeof questsRaw.credentialStages === "object" ? questsRaw.credentialStages : {};
  const mainStageId = passed ? "completed" : legacyQualified ? "XQ-M13" : MAIN_IDS.has(String(questsRaw?.mainStageId)) ? questsRaw!.mainStageId as XingniTaichuState["quests"]["mainStageId"] : base.quests.mainStageId;
  const hour = Math.max(0, Math.min(23, Math.trunc(Number(value.clock?.hour ?? base.clock.hour))));
  return {
    ...base,
    ...value,
    kind: "xingni_taichu",
    schemaVersion: 2,
    spiritRoot: root,
    spiritStones: Math.max(0, Math.min(999999, Math.trunc(Number(value.spiritStones ?? base.spiritStones)))),
    cultivation: {
      realm,
      progress: Math.max(0, Math.min(100, Math.trunc(Number(cultivation.progress ?? 0)))),
      qiSeaDamaged: cultivation.qiSeaDamaged !== false,
      qiSeaRepairStage: cultivation.qiSeaRepairStage === 1 || cultivation.qiSeaRepairStage === 2 ? cultivation.qiSeaRepairStage : cultivation.qiSeaDamaged === false ? 2 : 0,
      breakthroughReady: cultivation.breakthroughReady === true,
    },
    techniqueIds: strings(value.techniqueIds, 32).length ? strings(value.techniqueIds, 32) : base.techniqueIds,
    recipeIds: strings(value.recipeIds, 32),
    credentials,
    ascensionTrial: passed ? "passed" : value.ascensionTrial === "eligible" || legacyQualified ? "eligible" : "locked",
    unlockedMapIds: [...new Set(strings(value.unlockedMapIds, 12).length ? strings(value.unlockedMapIds, 12) : [QINGSHI_MAP_ID])],
    vitality: {
      health: Math.max(1, Math.min(100, Math.trunc(Number(value.vitality?.health ?? 100)))),
      maxHealth: 100,
      stamina: Math.max(0, Math.min(80, Math.trunc(Number(value.vitality?.stamina ?? 80)))),
      maxStamina: 80,
      injury: value.vitality?.injury === "light" || value.vitality?.injury === "severe" ? value.vitality.injury : "none",
    },
    materialCounts: numberRecord(value.materialCounts),
    protectedItemIds: [...new Set(strings(value.protectedItemIds, 32).concat(base.protectedItemIds))],
    equipment: { equippedArtifactId: typeof value.equipment?.equippedArtifactId === "string" ? value.equipment.equippedArtifactId : base.equipment.equippedArtifactId, artifactCondition: Math.max(0, Math.min(100, Math.trunc(Number(value.equipment?.artifactCondition ?? 25)))) },
    mastery: { techniques: numberRecord(value.mastery?.techniques, 0, 100), recipes: numberRecord(value.mastery?.recipes, 0, 100) },
    quests: {
      mainStageId,
      credentialStages: Object.fromEntries(CREDENTIALS.map((credential) => [credential, credentials.includes(credential) ? "completed" : ["introduced", "prepared"].includes(String(credentialStagesRaw[credential])) ? credentialStagesRaw[credential] : mainStageId === "XQ-M08" || mainStageId === "XQ-M09" || Number(mainStageId.replace(/\D/g, "")) >= 8 ? "introduced" : "locked"])) as Record<QingshiCredential, CredentialStage>,
      sideQuestStages: value.quests?.sideQuestStages && typeof value.quests.sideQuestStages === "object" ? value.quests.sideQuestStages : {},
      repeatableCounts: numberRecord(value.quests?.repeatableCounts, 0, 9),
    },
    relationships: { ...base.relationships, ...numberRecord(value.relationships, -100, 100) },
    clock: { day: Math.max(1, Math.min(999, Math.trunc(Number(value.clock?.day ?? 1)))), hour, slot: getQingshiTimeSlot(hour) },
    seenEventIds: strings(value.seenEventIds, 64),
    defeatCount: Math.max(0, Math.trunc(Number(value.defeatCount ?? 0))),
    recovery: { pending: value.recovery?.pending === true, lastLossStones: Math.max(0, Math.trunc(Number(value.recovery?.lastLossStones ?? 0))), lastLostMaterialId: typeof value.recovery?.lastLostMaterialId === "string" ? value.recovery.lastLostMaterialId : null, debtStones: Math.max(0, Math.trunc(Number(value.recovery?.debtStones ?? 0))) },
    ascensionAttempts: Math.max(0, Math.trunc(Number(value.ascensionAttempts ?? 0))),
    actionAttempts: numberRecord(value.actionAttempts, 0, 999),
    processedActionIds: strings(value.processedActionIds, 64),
  };
}

export type XingniActionType = "move" | "talk" | "accept_quest" | "advance_quest" | "submit_quest" | "rest" | "heal" | "wait" | "relief" | "gather" | "trade" | "trade_material_pack" | "cultivate" | "breakthrough" | "alchemy" | "refining" | "combat" | "retreat" | "ascension_trial";
export type XingniWorldAction = {
  type: XingniActionType;
  actionId?: string;
  idempotencyKey?: string;
  targetId?: string;
  locationId?: string;
  recipeId?: keyof typeof QINGSHI_RECIPES;
  materialIds?: string[];
  itemId?: string;
  quantity?: number;
  operation?: "buy" | "sell";
  method?: "root" | "combat" | "alchemy" | "refining" | "reckless";
  questId?: string;
};

export type XingniResolution = { ok: boolean; state: XingniTaichuState; consumedItemIds: string[]; awardedItemIds: string[]; message: string; outcome?: BattleOutcome; locationOverride?: string };

function withTime(state: XingniTaichuState, hours: number): XingniTaichuState {
  const absolute = state.clock.day * 24 + state.clock.hour + hours;
  const hour = absolute % 24;
  return { ...state, clock: { day: Math.floor(absolute / 24), hour, slot: getQingshiTimeSlot(hour) } };
}

function addMaterials(state: XingniTaichuState, ids: string[]): XingniTaichuState {
  const materialCounts = { ...state.materialCounts };
  for (const id of ids) materialCounts[id] = (materialCounts[id] ?? 0) + 1;
  return { ...state, materialCounts };
}

function creditSpiritStones(state: XingniTaichuState, amount: number): XingniTaichuState {
  const paidDebt = Math.min(amount, state.recovery.debtStones);
  return { ...state, spiritStones: state.spiritStones + amount - paidDebt, recovery: { ...state.recovery, debtStones: state.recovery.debtStones - paidDebt } };
}

function consumeMaterials(state: XingniTaichuState, ids: string[]): XingniTaichuState | null {
  const materialCounts = { ...state.materialCounts };
  for (const id of ids) {
    if ((materialCounts[id] ?? 0) <= 0) return null;
    materialCounts[id] -= 1;
  }
  return { ...state, materialCounts };
}

function advanceMain(state: XingniTaichuState, to: XingniTaichuState["quests"]["mainStageId"]): XingniTaichuState {
  return { ...state, quests: { ...state.quests, mainStageId: to } };
}

function withCredential(state: XingniTaichuState, credential: QingshiCredential): XingniTaichuState {
  if (state.quests.credentialStages[credential] !== "prepared") return state;
  const credentials = [...new Set([...state.credentials, credential])];
  let next = { ...state, credentials, quests: { ...state.quests, credentialStages: { ...state.quests.credentialStages, [credential]: "completed" as const } } };
  if (state.quests.mainStageId === "XQ-M08") next = advanceMain(next, "XQ-M09");
  else if (state.quests.mainStageId === "XQ-M09" && credentials.length >= 2) next = advanceMain(next, "XQ-M10");
  const eligible = next.cultivation.realm === "炼气4层" && credentials.length >= 2 && (next.quests.mainStageId === "XQ-M14" || next.quests.mainStageId === "completed");
  return { ...next, ascensionTrial: eligible && next.ascensionTrial === "locked" ? "eligible" : next.ascensionTrial };
}

function remember(state: XingniTaichuState, key: string): XingniTaichuState {
  return { ...state, processedActionIds: [...state.processedActionIds.filter((item) => item !== key).slice(-63), key] };
}

function actionKey(action: XingniWorldAction): string | null {
  const explicit = action.idempotencyKey ?? action.actionId;
  return typeof explicit === "string" && explicit.trim() ? explicit.trim() : null;
}

function inventoryCount(id: string, state: XingniTaichuState, inventory: string[]): number {
  return Math.max(state.materialCounts[id] ?? 0, inventory.filter((item) => item === id).length);
}

function fail(state: XingniTaichuState, message: string): XingniResolution {
  return { ok: false, state, consumedItemIds: [], awardedItemIds: [], message };
}

export function getCurrentQingshiObjective(state: XingniTaichuState): string {
  if (state.quests.mainStageId === "completed") return "升仙令已得，青云渡界门已解锁但尚未开放。";
  return QINGSHI_MAIN_STAGES.find((stage) => stage.id === state.quests.mainStageId)?.objective ?? "前往归雁客栈确认当前处境。";
}

export function isNpcServiceAvailable(npcId: string, locationId: string, hour: number): boolean {
  const profile = QINGSHI_NPC_PROFILES[npcId as keyof typeof QINGSHI_NPC_PROFILES];
  if (!profile) return false;
  const slot = getQingshiTimeSlot(hour);
  return profile.schedule[slot] === locationId && (profile.serviceWindows.length === 0 || (profile.serviceWindows as readonly string[]).includes(slot));
}

export function resolveXingniAction(stateRaw: XingniTaichuState, action: XingniWorldAction, context: { currentLocation?: string; inventoryItemIds?: string[] } = {}): XingniResolution {
  const state = normalizeXingniState(stateRaw);
  const currentLocation = context.currentLocation;
  const inventory = context.inventoryItemIds ?? [];
  const key = actionKey(action);
  if (key && state.processedActionIds.includes(key)) return fail(state, "该登记行动已经结算，本次未重复扣费或发奖。");
  const accept = (next: XingniTaichuState, message: string, consumedItemIds: string[] = [], awardedItemIds: string[] = [], extra: Partial<XingniResolution> = {}): XingniResolution => ({ ok: true, state: key ? remember(next, key) : next, consumedItemIds, awardedItemIds, message, ...extra });

  if (action.type === "wait") return accept(withTime(state, 6), "他按登记时段等待，县城中的人事随天色推进。", [], []);
  if (action.type === "rest") {
    if (currentLocation !== "QS_GUOYAN_INN") return fail(state, "只有归雁客栈提供登记休整。");
    if (state.spiritStones < 1 && !state.recovery.pending) return fail(state, "一枚灵石的房钱不足；柳三娘指向可免前置费用的客栈杂役。");
    const fee = state.recovery.pending ? 0 : 1;
    let next = withTime({ ...state, spiritStones: state.spiritStones - fee, vitality: { ...state.vitality, stamina: state.vitality.maxStamina, health: Math.min(state.vitality.maxHealth, state.vitality.health + 20) } }, 6);
    if (state.quests.mainStageId === "XQ-M01") next = advanceMain(next, "XQ-M02");
    return accept(next, fee ? "支付一枚灵石休整，体力已经恢复。" : "柳三娘先记下房钱，让重伤散修恢复了行动能力。");
  }
  if (action.type === "heal") {
    if (currentLocation !== "QS_GUOYAN_INN") return fail(state, "治疗恢复必须在归雁客栈结算。");
    const fee = state.vitality.injury === "severe" ? 5 : state.vitality.injury === "light" ? 2 : 0;
    if (fee === 0) return fail(state, "当前没有需要治疗的登记伤势。");
    if (state.spiritStones < fee && !state.recovery.pending) return fail(state, "治疗灵石不足，可先完成客栈杂役或坊市搬运。");
    const paid = Math.min(state.spiritStones, fee);
    const debt = fee - paid;
    return accept(withTime({ ...state, spiritStones: state.spiritStones - paid, vitality: { ...state.vitality, health: 100, stamina: 60, injury: "none" }, recovery: { ...state.recovery, pending: false, debtStones: state.recovery.debtStones + debt } }, 6), debt > 0 ? `柳三娘按五枚灵石的登记费用先行垫付治疗，尚欠${debt}枚灵石，后续委托收入会优先偿还。` : `支付${fee}枚灵石完成治疗，重伤风险已经解除。`);
  }
  if (action.type === "relief") {
    if (currentLocation !== "QS_GUOYAN_INN" || state.spiritStones > 1) return fail(state, "客栈救济只向近乎无灵石的散修开放。");
    const count = state.quests.repeatableCounts["XQ-R01"] ?? 0;
    if (count >= 1) return fail(state, "今日客栈杂役已经结算，可等待至次日或前往其他登记差事。");
    const rewarded = creditSpiritStones({ ...state, quests: { ...state.quests, repeatableCounts: { ...state.quests.repeatableCounts, "XQ-R01": 1 } } }, 2);
    return accept(withTime(rewarded, 6), "完成客栈杂役，两枚灵石收入已按客栈账目结算，基础恢复循环重新开放。");
  }
  if (action.type === "talk") {
    const npcId = action.targetId ?? "";
    if (!(npcId in QINGSHI_NPC_PROFILES)) return fail(state, "交谈对象未登记在青石县名册中。");
    if (getNpcLocationAt(npcId, state.clock.hour) !== currentLocation) return fail(state, "此人当前不在此地。可查看日程并等待下一时段。");
    let next = { ...state, relationships: { ...state.relationships, [npcId]: Math.min(100, (state.relationships[npcId] ?? 0) + 2) } };
    if (state.quests.mainStageId === "XQ-M02" && npcId === "XQ-N007") next = advanceMain(next, "XQ-M03");
    else if (state.quests.mainStageId === "XQ-M07") next = advanceMain({ ...next, quests: { ...next.quests, credentialStages: { combat: "introduced", alchemy: "introduced", refining: "introduced" } } }, "XQ-M08");
    else if (state.quests.mainStageId === "XQ-M10" && npcId === "XQ-N007") next = advanceMain(next, "XQ-M11");
    else if (state.quests.mainStageId === "XQ-M12" && npcId === "XQ-N001") next = advanceMain(next, "XQ-M13");
    else if (state.quests.mainStageId === "XQ-M13" && npcId === "XQ-N004" && state.cultivation.realm === "炼气4层" && state.credentials.length >= 2) next = { ...advanceMain(next, "XQ-M14"), ascensionTrial: "eligible" };
    return accept(withTime(next, 1), "交谈只确认了此人权限内的事实与当前可行方向。");
  }
  if (action.type === "accept_quest") {
    if (action.questId === "XQ-M03" && state.quests.mainStageId === "XQ-M03" && currentLocation === "QS_EXORCISM_OFFICE") return accept(advanceMain(state, "XQ-M04"), "镇邪司登记了寻找周小满的委托。");
    const repeatable = QINGSHI_REPEATABLES.find((quest) => quest.id === action.questId);
    if (repeatable && repeatable.locationId === currentLocation && (state.quests.repeatableCounts[repeatable.id] ?? 0) < repeatable.dailyLimit) return accept(withTime(creditSpiritStones({ ...state, quests: { ...state.quests, repeatableCounts: { ...state.quests.repeatableCounts, [repeatable.id]: (state.quests.repeatableCounts[repeatable.id] ?? 0) + 1 } } }, repeatable.reward), 6), `完成${repeatable.title}，结算${repeatable.reward}枚灵石。`);
    const credentialQuest = QINGSHI_CREDENTIAL_QUESTS.find((quest) => quest.id === action.questId);
    if (credentialQuest) {
      const credential = credentialQuest.credential;
      const mentor = QINGSHI_NPCS.find((npc) => npc.id === credentialQuest.mentorNpcId);
      if (state.quests.credentialStages[credential] !== "introduced" || mentor?.home !== currentLocation || !isNpcServiceAvailable(credentialQuest.mentorNpcId, currentLocation!, state.clock.hour)) return fail(state, "该凭证路线尚未介绍、导师不在场或服务时段关闭。");
      return accept({ ...state, quests: { ...state.quests, credentialStages: { ...state.quests.credentialStages, [credential]: "prepared" } } }, `${credentialQuest.id}的材料与风险准备已经登记，可以进行正式挑战。`);
    }
    const sideQuest = QINGSHI_SIDE_QUESTS.find((quest) => quest.id === action.questId);
    if (sideQuest && sideQuest.startLocationId === currentLocation && getNpcLocationAt(sideQuest.npcId, state.clock.hour) === currentLocation && !state.quests.sideQuestStages[sideQuest.id]) {
      return accept({ ...state, quests: { ...state.quests, sideQuestStages: { ...state.quests.sideQuestStages, [sideQuest.id]: "active" } } }, `接下${sideQuest.title}，目标地点已经登记。`);
    }
    return fail(state, "该委托当前未开放、地点不符或今日已达奖励上限。");
  }
  if (action.type === "advance_quest") {
    if (action.targetId === "XQ-M05" && state.quests.mainStageId === "XQ-M05" && currentLocation === "QS_BLACK_PINE_RIDGE" && action.method === "root") return accept(advanceMain(withTime(state, 1), "XQ-M06"), `${state.spiritRoot}灵根以登记解法处理了瘴障。`);
    if (action.targetId === "XQ-M11" && state.quests.mainStageId === "XQ-M11" && currentLocation === "QS_BLACK_PINE_RIDGE" && action.method && state.credentials.includes(action.method as QingshiCredential)) return accept(advanceMain(withTime(state, 1), "XQ-M12"), "黑松支脉已按取得凭证对应的方案稳定下来。");
    const sideQuest = QINGSHI_SIDE_QUESTS.find((quest) => quest.id === action.questId);
    if (sideQuest && state.quests.sideQuestStages[sideQuest.id] === "active" && sideQuest.objectiveLocationId === currentLocation) {
      return accept(withTime(creditSpiritStones({ ...state, quests: { ...state.quests, sideQuestStages: { ...state.quests.sideQuestStages, [sideQuest.id]: "completed" } }, reputation: state.reputation + 1 }, sideQuest.reward), 1), `${sideQuest.title}完成，结算${sideQuest.reward}枚灵石与一点县域声望。`);
    }
    return fail(state, "当前任务阶段、地点或登记解法不满足推进条件。");
  }
  if (action.type === "gather") {
    if (currentLocation !== "QS_BLACK_PINE_RIDGE" || (action.locationId && action.locationId !== currentLocation)) return fail(state, "只有黑松岭登记采集点才能采集灵材。");
    const ids = ["xq_herb_spirit_leaf", "xq_herb_sun_seed", "xq_ore_black_iron"];
    if (state.spiritRoot === "青木") ids.push("xq_herb_spirit_leaf");
    let next = addMaterials(withTime({ ...state, vitality: { ...state.vitality, stamina: Math.max(0, state.vitality.stamina - 10) } }, 1), ids);
    if (state.quests.mainStageId === "XQ-M04") next = advanceMain(addMaterials(next, ["xq_quest_herb_basket"]), "XQ-M05");
    return accept(next, "采集得到登记灵材；青木灵根更易辨得额外灵叶。", [], ids);
  }
  if (action.type === "trade_material_pack") action = { ...action, type: "trade", operation: "buy", itemId: "material_pack", quantity: 1 };
  if (action.type === "trade") {
    if (currentLocation !== "QS_CULTIVATOR_MARKET") return fail(state, "交易只能在散修坊市登记摊位结算。");
    const quantity = Math.max(1, Math.min(9, Math.trunc(action.quantity ?? 1)));
    if (action.itemId === "material_pack" && action.operation === "buy") {
      if (state.spiritStones < 2 * quantity) return fail(state, "购买入门灵材包需要每份两枚灵石。");
      const ids = Array.from({ length: quantity }, () => ["xq_herb_spirit_leaf", "xq_herb_sun_seed", "xq_ore_black_iron"]).flat();
      return accept(addMaterials({ ...state, spiritStones: state.spiritStones - 2 * quantity }, ids), `购得${quantity}份入门灵材包。`, [], ids);
    }
    const item = QINGSHI_ITEMS[action.itemId as keyof typeof QINGSHI_ITEMS];
    if (!item || item.protected || action.operation !== "sell" || item.sell === null) return fail(state, "该物品不可按当前方式交易。");
    if (inventoryCount(action.itemId!, state, inventory) < quantity) return fail(state, "出售数量超过持有数量。");
    const consumed = consumeMaterials(state, Array.from({ length: quantity }, () => action.itemId!));
    if (!consumed) return fail(state, "普通材料数量不足。");
    return accept({ ...consumed, spiritStones: consumed.spiritStones + item.sell * quantity }, `出售${quantity}份${item.name}。`, Array.from({ length: quantity }, () => action.itemId!));
  }
  if (action.type === "cultivate" || action.type === "breakthrough") {
    if (currentLocation !== "QS_SPIRIT_SPRING_CAVE") return fail(state, "只有灵泉洞能完成登记吐纳与首图突破。");
    if (state.vitality.injury === "severe") return fail(state, "重伤状态不能强行修炼，应先返回归雁客栈恢复。");
    const gain = state.spiritRoot === "玄水" ? 60 : 50;
    const nextProgress = Math.min(100, state.cultivation.progress + gain);
    let cultivation = { ...state.cultivation, progress: nextProgress, breakthroughReady: nextProgress >= 100 };
    let next = withTime({ ...state, cultivation, vitality: { ...state.vitality, stamina: Math.max(0, state.vitality.stamina - 15) } }, 6);
    if (nextProgress >= 100 && state.cultivation.realm === "炼气2层") {
      cultivation = { realm: "炼气3层", progress: 0, qiSeaDamaged: false, qiSeaRepairStage: 2, breakthroughReady: false };
      next = { ...next, cultivation };
      if (state.quests.mainStageId === "XQ-M06") next = advanceMain(next, "XQ-M07");
    } else if (nextProgress >= 100 && state.cultivation.realm === "炼气3层") cultivation = { ...cultivation, realm: "炼气4层", progress: 0, breakthroughReady: false };
    next = { ...next, cultivation };
    return accept(next, cultivation.realm === state.cultivation.realm ? "吐纳完成，修为进度有所增长。" : `气机贯通，修为恢复至${cultivation.realm}。`);
  }
  if (action.type === "alchemy" || action.type === "refining") {
    const recipe = QINGSHI_RECIPES[action.recipeId as keyof typeof QINGSHI_RECIPES];
    if (!recipe || recipe.station !== currentLocation) return fail(state, "配方未登记或当前不在对应服务台。");
    const mentorId = action.type === "alchemy" ? "XQ-N002" : "XQ-N003";
    if (!isNpcServiceAvailable(mentorId, currentLocation!, state.clock.hour)) return fail(state, "导师当前不在场或服务时段已关闭，可等待下一时段。");
    if (state.spiritStones < recipe.fee) return fail(state, `本次工序需要${recipe.fee}枚灵石。`);
    const required = [...recipe.inputs];
    if (required.some((id) => inventoryCount(id, state, inventory) <= 0)) return fail(state, "登记材料不足，工序没有开始。");
    const consumed = consumeMaterials(state, required) ?? state;
    const favored = state.spiritRoot === recipe.favoredRoot;
    const attempts = (state.actionAttempts[action.recipeId!] ?? 0) + 1;
    const advancedRecipe = action.recipeId === "pill_miasma_clearing";
    if (advancedRecipe && !favored && attempts === 1) return accept(withTime({ ...consumed, spiritStones: consumed.spiritStones - recipe.fee, actionAttempts: { ...state.actionAttempts, [action.recipeId!]: attempts }, vitality: { ...state.vitality, stamina: Math.max(0, state.vitality.stamina - 10) } }, 1), "火候第一次失衡，材料已经消耗；导师给出了可复验的补救步骤。", required);
    let next = addMaterials(withTime({ ...consumed, spiritStones: consumed.spiritStones - recipe.fee, recipeIds: [...new Set([...state.recipeIds, action.recipeId!])], actionAttempts: { ...state.actionAttempts, [action.recipeId!]: attempts }, mastery: { ...state.mastery, recipes: { ...state.mastery.recipes, [action.recipeId!]: (state.mastery.recipes[action.recipeId!] ?? 0) + (favored ? 2 : 1) } } }, 1), [recipe.output]);
    const credential = action.type === "alchemy" ? "alchemy" : "refining";
    if (action.recipeId === "pill_qi_gathering" || action.recipeId === "repair_damaged_artifact") next = withCredential(next, credential);
    if (action.type === "refining") next = { ...next, equipment: { equippedArtifactId: "xq_artifact_restored_blade", artifactCondition: 100 } };
    return accept(next, `${action.type === "alchemy" ? "炼制" : "炼器"}成功，结构化结果已结算。`, required, [recipe.output]);
  }
  if (action.type === "retreat") {
    if (currentLocation !== "QS_BLACK_PINE_RIDGE") return fail(state, "当前没有可登记撤退的岭中战斗。");
    const loss = state.spiritRoot === "玄水" ? 5 : 15;
    return accept(withTime({ ...state, vitality: { ...state.vitality, stamina: Math.max(0, state.vitality.stamina - loss) } }, 1), "他从登记山路撤回，玄水灵根更易保住体力。", [], [], { outcome: "retreat", locationOverride: "QS_SOUTH_GATE" });
  }
  if (action.type === "combat") {
    if (currentLocation !== "QS_BLACK_PINE_RIDGE" || !["XQ-E001", "XQ-E003"].includes(action.targetId ?? "")) return fail(state, "目标不在当前地点的青石县登记妖兽名册中。");
    const hard = action.targetId === "XQ-E003";
    const prepared = state.vitality.stamina >= (hard ? 30 : 20) && state.vitality.injury !== "severe";
    const defeat = action.method === "reckless" || !prepared || (hard && state.spiritRoot !== "赤火" && state.equipment.artifactCondition < 60);
    if (defeat) {
      const lossStones = Math.min(state.spiritStones, Math.floor(state.spiritStones * 0.25));
      const lostMaterialId = Object.entries(state.materialCounts).find(([id, count]) => count > 0 && !QINGSHI_ITEMS[id as keyof typeof QINGSHI_ITEMS]?.protected)?.[0] ?? null;
      const materialCounts = { ...state.materialCounts };
      if (lostMaterialId) materialCounts[lostMaterialId] -= 1;
      const defeated = withTime({ ...state, spiritStones: state.spiritStones - lossStones, materialCounts, vitality: { ...state.vitality, health: 20, stamina: 10, injury: "severe" }, defeatCount: state.defeatCount + 1, recovery: { ...state.recovery, pending: true, lastLossStones: lossStones, lastLostMaterialId: lostMaterialId } }, 6);
      return accept(defeated, `战败后重伤回到归雁客栈，损失${lossStones}枚灵石${lostMaterialId ? "及一组普通材料" : ""}；关键进度全部保留。`, lostMaterialId ? [lostMaterialId] : [], [], { outcome: "defeat", locationOverride: "QS_GUOYAN_INN" });
    }
    const overwhelming = state.spiritRoot === "赤火" && state.equipment.artifactCondition >= 60;
    const reward = action.targetId === "XQ-E001" ? ["xq_material_boar_tusk"] : ["xq_herb_spirit_leaf"];
    const next = withCredential(addMaterials(withTime({ ...state, vitality: { ...state.vitality, stamina: Math.max(0, state.vitality.stamina - (overwhelming ? 15 : 25)), health: Math.max(1, state.vitality.health - (overwhelming ? 0 : 10)) } }, 1), reward), "combat");
    return accept(next, overwhelming ? "赤火与完整法器形成压制，取得无伤大胜。" : "击退登记妖兽并取得战斗凭证。", [], reward, { outcome: overwhelming ? "overwhelming" : "victory" });
  }
  if (action.type === "ascension_trial") {
    if (currentLocation !== "QS_ASCENSION_TERRACE" || action.targetId !== "XQ-E002") return fail(state, "升仙试只能在升仙台对登记阵傀结算。");
    if (state.quests.mainStageId !== "XQ-M14" || state.cultivation.realm !== "炼气4层" || state.credentials.length < 2 || state.ascensionTrial === "locked") return fail(state, "尚缺少主线阶段、炼气四层或两项历练凭证，不能结算升仙试。");
    const attempts = state.ascensionAttempts + 1;
    const prepared = state.vitality.injury === "none" && state.vitality.stamina >= 30;
    if (!prepared || action.method === "reckless") {
      const next = withTime({ ...state, ascensionAttempts: attempts, vitality: { ...state.vitality, health: Math.max(20, state.vitality.health - 35), stamina: 10, injury: "light" } }, 6);
      return accept(next, "阵傀逼退挑战者，留下轻伤与一个时段的代价；资格仍然保留。", [], [], { outcome: "defeat" });
    }
    return accept({ ...state, ascensionAttempts: attempts, ascensionTrial: "passed", quests: { ...state.quests, mainStageId: "completed" }, unlockedMapIds: [...new Set([...state.unlockedMapIds, QINGYUN_FERRY_MAP_ID])] }, "升仙试通过，通往青云渡的界门已解锁但尚未开放。", [], ["xq_token_ascension_pass"], { outcome: "victory" });
  }
  return fail(state, "该星逆行动尚未登记，不能产生权威变化。");
}

export type XingniWorldDelta = { action?: XingniWorldAction };
export function validateAndResolveXingniWorldDelta(state: XingniTaichuState, candidate: unknown, context: { currentLocation?: string; inventoryItemIds?: string[] } = {}): XingniResolution {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return fail(normalizeXingniState(state), "未提供可验证的玄幻状态变化。");
  const action = (candidate as XingniWorldDelta).action;
  if (!action || typeof action !== "object" || typeof action.type !== "string") return fail(normalizeXingniState(state), "玄幻状态变化缺少登记动作。");
  return resolveXingniAction(state, action, context);
}

export function getQingshiRecoverySteps(state: XingniTaichuState): string[] {
  if (state.vitality.injury !== "severe" && state.spiritStones > 1) return [];
  return ["在归雁客栈申请客栈杂役", "先行休整恢复体力", "接受客栈垫付治疗并记录差额", "完成坊市搬运或镇邪巡路偿还账目", "确认伤势解除", "返回采集、修炼或任务循环"];
}

export const QINGSHI_REGISTERED_ACTION_TYPES: readonly XingniActionType[] = ["move", "talk", "accept_quest", "advance_quest", "submit_quest", "rest", "heal", "wait", "relief", "gather", "trade", "trade_material_pack", "cultivate", "breakthrough", "alchemy", "refining", "combat", "retreat", "ascension_trial"];
export const XINGNI_WORLD_SCOPE = { worldId: XINGNI_WORLD_ID, mapId: QINGSHI_MAP_ID } as const;
